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

  vpc_security_group_ids = [aws_security_group.ecs.id]

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
