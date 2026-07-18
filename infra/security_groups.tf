resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-sg-bastion"
  description = "Bastion SSH access"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name    = "${var.project_name}-sg-bastion"
    Project = var.project_name
  }
}

resource "aws_security_group_rule" "bastion_ssh_in" {
  // インバウンド、外から入ってくる通信
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = var.allowed_ssh_cidrs
  security_group_id = aws_security_group.bastion.id
}

resource "aws_security_group" "alb" {
  name        = "${var.project_name}-sg-alb"
  description = "ALB HTTP access"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name    = "${var.project_name}-sg-alb"
    Project = var.project_name
  }
}

// 管理者がcurlで叩けるようにするためのrule
resource "aws_security_group_rule" "alb_http_in_admin" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = var.allowed_admin_cidrs
  security_group_id = aws_security_group.alb.id
}

// CloudFrontからのアクセスを許可するためのrule
resource "aws_security_group_rule" "alb_http_in_cloudfront" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  prefix_list_ids   = ["pl-58a04531"] # CloudFrontのオリジン向けIP範囲(ap-northeast-1での)
  security_group_id = aws_security_group.alb.id
}


