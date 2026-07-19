data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }
}

resource "aws_instance" "bastion" {
  ami           = data.aws_ami.amazon_linux.id
  instance_type = "t4g.nano"
  subnet_id     = values(aws_subnet.public)[0].id
  // パブリックIPアドレスを自動的に割り当てる
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  key_name                    = var.key_pair_name

  tags = {
    Name    = "${var.project_name}-bastion"
    Project = var.project_name
  }
}