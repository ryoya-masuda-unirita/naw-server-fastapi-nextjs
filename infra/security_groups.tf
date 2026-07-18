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
