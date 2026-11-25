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
  subnet_id     = var.public_subnet_id
  // パブリックIPアドレスを自動的に割り当てる
  associate_public_ip_address = true
  vpc_security_group_ids      = [var.bastion_sg_id]
  key_name                    = var.key_pair_name

  tags = {
    Name = "${var.project_name}-bastion"
  }

  // AMIは most_recent で引くため、新しいAMIが出るたびにplanが踏み台の再作成を出す。
  // 踏み台は、使い捨ての中継用なので、AMIの更新では作り直さない(作り直したいときは terraform taint)
  lifecycle {
    ignore_changes = [ami]
  }
}
