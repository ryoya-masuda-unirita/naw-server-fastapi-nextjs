// インターネット向けのApplication Load Balancer
resource "aws_lb" "main" {
  name = "${var.project_name}-alb"
  // falseで外部（インターネット）向け。trueにするとVPC内部専用のALBになる
  internal = false
  // application=L7(HTTP/HTTPS)ロードバランサー。他にnetwork(L4)・gatewayが選べる
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for s in aws_subnet.public : s.id]

  tags = {
    Name    = "${var.project_name}-alb"
    Project = var.project_name
  }
}

// backendコンテナへ振り分けるターゲットグループ
resource "aws_lb_target_group" "backend" {
  name     = "${var.project_name}-tg"
  port     = 8000
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id
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
    Name    = "${var.project_name}-tg"
    Project = var.project_name
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
