resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  tags = {
    Name    = "${var.project_name}-cluster"
    Project = var.project_name
  }
}

resource "aws_launch_template" "ecs" {
  name_prefix = "${var.project_name}-ecs-"
  // SSMパラメータストアからECS最適化AMIの最新IDを取得する
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = "t4g.nano"

  // このテンプレートで起動するEC2に、iam.tfで作ったインスタンスプロファイル(ecs_instanceロール入り)をアタッチする。
  // これがないとEC2上のECSエージェントがクラスタと通信する権限を持てず、クラスタに参加できない。
  iam_instance_profile {
    name = aws_iam_instance_profile.ecs.name
  }

  // publicサブネットに配置してもpublic IPが付かないとECR/ECS APIに出られないため付与する。
  // SG指定もこちらに移す（vpc_security_group_idsとは併用不可）。
  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.ecs.id]
  }

  // EC2起動時に実行するスクリプト。このEC2がどのECSクラスタに参加するかをecs.configに書き込む
  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo ECS_CLUSTER=${aws_ecs_cluster.main.name} >> /etc/ecs/ecs.config
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name    = "${var.project_name}-ecs-instance"
      Project = var.project_name
    }
  }
}

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
}

resource "aws_autoscaling_group" "ecs" {
  name                = "${var.project_name}-ecs-asg"
  vpc_zone_identifier = [for s in aws_subnet.public : s.id]
  min_size            = 1
  max_size            = 1
  // 常に1台だけ維持する（学習・コスト重視のため、min/max/desired全て1で固定）
  desired_capacity = 1

  // 起動時に使うテンプレートを指定。$Latestで常に最新バージョンのLaunch Templateを使う
  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest"
  }

  tag {
    key   = "Name"
    value = "${var.project_name}-ecs-instance"
    // trueにすると、このタグがASGが起動する各EC2インスタンスにも自動で付与される
    propagate_at_launch = true
  }

  tag {
    key                 = "Project"
    value               = var.project_name
    propagate_at_launch = true
  }
}

// ASGをECSクラスタが使える計算資源として登録する
resource "aws_ecs_capacity_provider" "main" {
  name = "${var.project_name}-cp"

  auto_scaling_group_provider {
    auto_scaling_group_arn = aws_autoscaling_group.ecs.arn

    // ASGの利用率が100%に達するまでスケールアウトしない設定（今回はmin=max=1固定なので実質影響なし）
    managed_scaling {
      status          = "ENABLED"
      target_capacity = 100
    }
  }
}

// クラスタに上記のCapacity Providerを紐付ける
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = [aws_ecs_capacity_provider.main.name]
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project_name}-backend"
  retention_in_days = 7

  tags = {
    Name    = "${var.project_name}-backend-logs"
    Project = var.project_name
  }
}

// backendコンテナの｢タスク定義｣。DB・Redis接続情報や各種設定を環境変数として渡す
resource "aws_ecs_task_definition" "backend" {
  family = "${var.project_name}-backend"
  // EC2モードで実行するため、bridgeモードを指定
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]

  // execution_role_arn: ECSエージェント(コンテナ起動の仕組み自体)が使うロール。ECR pull・CloudWatch Logs書き込みに使う。
  // task_role_arn: コンテナ内で動くアプリコード(backend)が使うロール。AWS SDK経由でのSQS/S3操作等に使う。
  // 用途が異なるため別々のロールとして指定でき、それぞれ1つずつアタッチできる(2つ同時に持てる)。
  execution_role_arn = aws_iam_role.ecs_task_execution.arn
  // アプリコード(backend)がSQS/S3を操作するためのロール
  task_role_arn = aws_iam_role.backend_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "${aws_ecr_repository.backend.repository_url}:latest"
      memory    = 128
      essential = true

      portMappings = [
        {
          // コンテナ内のポート8000をホストの8000番ポートにマッピングする
          containerPort = 8000
          // ホストの8000番ポートにマッピングする
          hostPort = 8000
          protocol = "tcp"
        }
      ]

      environment = [
        {
          name  = "DATABASE_URL"
          value = "postgresql+asyncpg://${aws_db_instance.main.username}:${var.db_password}@${aws_db_instance.main.address}:5432/${aws_db_instance.main.db_name}"
        },
        {
          name  = "REDIS_URL"
          value = "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379/0"
        },
        { name = "SECRET_KEY", value = var.secret_key },
        { name = "COOKIE_SECURE", value = "true" },
        { name = "COOKIE_SAME_SITE", value = "lax" },
        { name = "CORS_ALLOWED_ORIGINS", value = "" },
        {
          name  = "CORS_ALLOWED_ORIGIN_REGEX"
          value = "https://([a-z0-9-]+\\.)?${replace(var.domain_name, ".", "\\.")}"
        },
        // backendがユーザーインポート用CSVを置くS3バケット名(app.core.file_storage.S3FileStorageが参照)
        { name = "AWS_S3_BUCKET_NAME", value = aws_s3_bucket.user_import.bucket },
        // backendがジョブ登録・受信に使うSQSキューのURL(user_import_queue_service/listenerが参照)
        { name = "AWS_SQS_QUEUE_URL", value = aws_sqs_queue.user_import.url },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "backend"
        }
      }
    }
  ])
  tags = {
    Name    = "${var.project_name}-backend-task"
    Project = var.project_name
  }

  // deploy-backend.ymlがpushのたびにAWS CLIで新しいイメージタグのリビジョンを登録する。
  // ignore_changesが無いと、次回terraform applyでこのリソースが元のイメージタグ(latest固定)に
  // 巻き戻り、CIが進めたデプロイを意図せず打ち消してしまうため、container_definitionsの変更を無視する。
  lifecycle {
    ignore_changes = [container_definitions]
  }
}

// タスク定義を実際に起動し続け、ALBターゲットグループに紐付けるサービス
resource "aws_ecs_service" "backend" {
  name            = "${var.project_name}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1

  // Issue #158で1台構成+ホストポート固定によるデプロイのデッドロックを経験したため0にする
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.main.name
    // 1台構成なのでweight=1で固定
    weight = 1
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  // ALBリスナーが先に作られていないと登録に失敗するため明示的に依存を指定
  depends_on = [aws_lb_listener.http]

  // deploy-backend.ymlがCIで新しいタスク定義リビジョンにupdate-serviceする。
  // ignore_changesが無いと、次回terraform applyでtask_definitionがTerraform管理のリビジョンに
  // 巻き戻り、CIが進めたデプロイを意図せず打ち消してしまうため、この属性の変更を無視する。
  lifecycle {
    ignore_changes = [task_definition]
  }
}
