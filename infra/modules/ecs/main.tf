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
    security_groups             = [var.ecs_sg_id]
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
  vpc_zone_identifier = var.public_subnet_ids
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
      image     = "${var.ecr_repository_url}:latest"
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
          value = "postgresql+asyncpg://${var.rds_username}:${var.db_password}@${var.rds_address}:5432/${var.rds_db_name}"
        },
        {
          name  = "REDIS_URL"
          value = "redis://${var.redis_endpoint}:6379/0"
        },
        { name = "SECRET_KEY", value = var.secret_key },
        { name = "COOKIE_SECURE", value = "true" },
        { name = "COOKIE_SAME_SITE", value = "lax" },
        // 独自ドメインを廃止したため、CloudFrontのデフォルトドメイン1つを固定オリジンとして許可する
        { name = "CORS_ALLOWED_ORIGINS", value = "https://${var.cloudfront_domain_name}" },
        { name = "CORS_ALLOWED_ORIGIN_REGEX", value = "" },
        // backendがユーザーインポート用CSVを置くS3バケット名(app.core.file_storage.S3FileStorageが参照)
        { name = "AWS_S3_BUCKET_NAME", value = var.user_import_bucket_name },
        // backendがジョブ登録・受信に使うSQSキューのURL(user_import_queue_service/listenerが参照)
        { name = "AWS_SQS_QUEUE_URL", value = var.user_import_queue_url },
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
    target_group_arn = var.target_group_arn
    container_name   = "backend"
    container_port   = 8000
  }

  // ALBリスナーが先に作られていないと登録に失敗する。alb モジュールの出力 target_group_arn が
  // リスナーに依存しているため、ここでの明示的な depends_on は要らない。

  // deploy-backend.ymlがCIで新しいタスク定義リビジョンにupdate-serviceする。
  // ignore_changesが無いと、次回terraform applyでtask_definitionがTerraform管理のリビジョンに
  // 巻き戻り、CIが進めたデプロイを意図せず打ち消してしまうため、この属性の変更を無視する。
  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_cloudwatch_log_group" "backend_migrate" {
  name              = "/ecs/${var.project_name}-backend-migrate"
  retention_in_days = 7

  tags = {
    Name    = "${var.project_name}-backend-migrate-logs"
    Project = var.project_name
  }
}

// DBマイグレーション(alembic upgrade head)専用のタスク定義。deploy-backend.ymlがECSの一時タスク
// (aws ecs run-task)として都度実行する。backendサービスと同じイメージ・DB接続情報を使うが、
// portMappingsを持たない点が異なる。backendはhostPort=8000固定のため、同一タスク定義のまま
// one-off実行すると、単一EC2インスタンス上でポート競合しスケジューリングに失敗するため分離している。
resource "aws_ecs_task_definition" "backend_migrate" {
  family                   = "${var.project_name}-backend-migrate"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]

  execution_role_arn = aws_iam_role.ecs_task_execution.arn
  task_role_arn      = aws_iam_role.backend_task.arn

  container_definitions = jsonencode([
    {
      name  = "backend-migrate"
      image = "${var.ecr_repository_url}:latest"
      // backendサービス(memory=128)と単一EC2インスタンス上に同居しても圧迫しないよう小さく抑える
      memory    = 96
      essential = true

      // backendイメージの既定CMD(uvicorn起動)を上書きし、マイグレーションだけ実行して終了させる
      command = ["uv", "run", "--no-sync", "alembic", "upgrade", "head"]

      environment = [
        {
          name  = "DATABASE_URL"
          value = "postgresql+asyncpg://${var.rds_username}:${var.db_password}@${var.rds_address}:5432/${var.rds_db_name}"
        },
        // alembic env.pyがapp.core.config.get_settings()経由でSettings()を構築するため、
        // database_urlと同様に必須(デフォルト無し)のsecret_keyも渡す必要がある
        { name = "SECRET_KEY", value = var.secret_key },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend_migrate.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "backend-migrate"
        }
      }
    }
  ])

  tags = {
    Name    = "${var.project_name}-backend-migrate-task"
    Project = var.project_name
  }

  // deploy-backend.ymlがpushのたびに新しいイメージタグでこのタスク定義も更新登録するため、
  // backend同様にcontainer_definitionsの変更を無視する(terraform applyでの巻き戻り防止)。
  lifecycle {
    ignore_changes = [container_definitions]
  }
}
// ECSタスク自体（コンテナ）が起動する際に「引き受ける」ロール。
// assume_role_policyでこのロールを引き受けられる主体をecs-tasks.amazonaws.comに限定している。
// 実際の権限（何ができるか）は下のaws_iam_role_policy_attachmentでアタッチする。
// ECRからのイメージpull・CloudWatch Logsへのログ書き込みに使われる。
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

// AWSが用意している既製の権限ポリシー(AmazonECSTaskExecutionRolePolicy)を
// 上のecs_task_executionロールにアタッチする。ECR pull・CloudWatch Logs書き込み権限が一通り含まれる。
resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

// ECSクラスタに参加するEC2インスタンス自体が引き受けるロール。
// assume_role_policyでec2.amazonaws.comだけがこのロールを引き受けられるようにしている。
// EC2上で常駐するECSエージェントが、クラスタとの通信（タスク登録状況の報告等）に使う。
resource "aws_iam_role" "ecs_instance" {
  name = "${var.project_name}-ecs-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

// AWSが用意している既製の権限ポリシー(AmazonEC2ContainerServiceforEC2Role)を
// 上のecs_instanceロールにアタッチする。ECSエージェントがクラスタと通信するための権限が含まれる。
resource "aws_iam_role_policy_attachment" "ecs_instance" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

// EC2はIAMロールを直接アタッチできず、必ずインスタンスプロファイルという箱を経由する必要がある。
// ここでecs_instanceロールを箱に詰め、aws_launch_template側からこのインスタンスプロファイルを参照する。
resource "aws_iam_instance_profile" "ecs" {
  name = "${var.project_name}-ecs-instance-profile"
  role = aws_iam_role.ecs_instance.name
}

// ECSタスク(コンテナ)内で動くbackendアプリコード(boto3等)が引き受けるロール。
// execution_role_arn(ecs_task_execution、ECR pull/CloudWatch Logs用)とは役割が異なるため分離する。
// この時点ではまだ「何ができるか」は無く、器(引き受け元の許可)だけを定義している。
resource "aws_iam_role" "backend_task" {
  name = "${var.project_name}-backend-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

// backendがユーザーインポート用SQS/S3を操作するためのインラインポリシー。
// backend/app/services/user_import_queue_service.py・user_import_listener.py・
// app/core/file_storage.pyで実際に呼ばれているSDK操作にのみ対応するActionを許可する。
// 対象リソースをこのキュー・バケットのみに限定する(ワイルドカードを使わない)。
resource "aws_iam_role_policy" "backend_task_sqs_s3" {
  name = "${var.project_name}-backend-task-sqs-s3-policy"
  role = aws_iam_role.backend_task.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        // アップロード時のSendMessage、リスナーのReceiveMessage/DeleteMessageに対応。
        // GetQueueAttributesはロングポーリング(WaitTimeSeconds)の内部処理で使われるため含める。
        Sid    = "UserImportQueueAccess"
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        // キュー自体のARNを指定(オブジェクト単位の概念が無いため/*は付けない)
        Resource = [
          var.user_import_queue_arn
        ]
      },
      {
        // CSVアップロード(PutObject)・リスナーでの読み込み(GetObject)・後始末の削除(DeleteObject)に対応
        Sid    = "UserImportBucketAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        // オブジェクトに対する操作のため、バケットARNの末尾に/*を付けてスコープを絞る
        Resource = [
          "${var.user_import_bucket_arn}/*"
        ]
      }
    ]
  })
}