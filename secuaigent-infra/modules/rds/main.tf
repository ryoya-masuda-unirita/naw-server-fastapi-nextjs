resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

// マスターパスワードは人が決めず、Terraformが生成する。記号を含めないのは、接続文字列(URL)に埋め込んでも
// エスケープが要らないようにするため。値は、出力(master_password)でsecretsモジュールに渡し、Secrets Managerに保存する。
resource "random_password" "master" {
  length  = 32
  special = false
}

locals {
  // パラメータグループのファミリは、エンジンのメジャーバージョンから決める(食い違いを防ぐ)
  pg_major = split(".", var.engine_version)[0]
}

// パラメータの値は既定のまま(移植元と同じ)。後から調整できるよう、専用のグループを用意しておく。
resource "aws_db_parameter_group" "main" {
  name   = "${var.project_name}-pg${local.pg_major}"
  family = "postgres${local.pg_major}"

  tags = {
    Name = "${var.project_name}-pg${local.pg_major}"
  }

  // メジャーバージョンを上げるとnameが変わる。使用中のグループは先に消せないため、新しいものを先に作る
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-db"
  engine     = "postgres"
  // メジャーのみ指定する(マイナーはAWSに任せる)。マイナーまで固定すると、自動のマイナー更新のたびに差分が出る。
  // ローカルの開発環境(postgres:18)と同じメジャーにしている。
  engine_version    = var.engine_version
  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  db_name           = "postgres"
  storage_type      = "gp3"
  // tfstateと同様、DBの中身も保存時に暗号化する(後から変えるとDBの再作成になる)
  storage_encrypted      = true
  username               = "root"
  password               = random_password.master.result
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_sg_id]
  parameter_group_name   = aws_db_parameter_group.main.name
  publicly_accessible    = false
  skip_final_snapshot    = true

  backup_retention_period    = var.backup_retention_period
  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.project_name}-db"
  }
}
