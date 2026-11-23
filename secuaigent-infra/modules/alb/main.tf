// インターネット向けのApplication Load Balancer
resource "aws_lb" "main" {
  name = "${var.project_name}-alb"
  // falseで外部（インターネット）向け。trueにするとVPC内部専用のALBになる
  internal = false
  // application=L7(HTTP/HTTPS)ロードバランサー。他にnetwork(L4)・gatewayが選べる
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnet_ids

  tags = {
    Name = "${var.project_name}-alb"
  }
}

// backendコンテナへ振り分けるターゲットグループ
resource "aws_lb_target_group" "backend" {
  name     = "${var.project_name}-tg"
  port     = 8000
  protocol = "HTTP"
  vpc_id   = var.vpc_id
  // EC2起動タイプ+bridgeモードなのでEC2インスタンス単位で振り分ける（Fargateならipを指定する）
  target_type = "instance"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name = "${var.project_name}-tg"
  }
}

// ALBがHTTP:80で受けたリクエストをbackendのターゲットグループへ転送するリスナー
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}
