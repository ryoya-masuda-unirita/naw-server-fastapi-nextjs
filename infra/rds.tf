resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = [for s in aws_subnet.private : s.id]

  tags = {
    Name    = "${var.project_name}-db-subnet-group"
    Project = var.project_name
  }
}

resource "aws_db_instance" "main" {
  identifier             = "${var.project_name}-db"
  engine                 = "postgres"
  instance_class         = "db.t4g.micro"
  allocated_storage      = 20
  db_name                = "postgres"
  storage_type           = "gp3"
  username               = "root"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  skip_final_snapshot    = true

  tags = {
    Name    = "${var.project_name}-db"
    Project = var.project_name
  }
}