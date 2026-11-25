// RDSを手動で停止していても、AWSは7日後に自動で再起動する。これを避けるため、
// 毎日1回10分だけ起動して停止する(09:00起動・09:10停止)。CLAUDE.mdの「RDSの運用方針」の実体。
// 作業中(09:10をまたぐ作業)に止まらないよう、既定では作らない。使うときだけ有効にする。

resource "aws_iam_role" "rds_schedule" {
  count = var.enable_keepalive_schedule ? 1 : 0

  name = "${var.project_name}-rds-schedule"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "rds_schedule" {
  count = var.enable_keepalive_schedule ? 1 : 0

  name = "start-stop-db"
  role = aws_iam_role.rds_schedule[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["rds:StartDBInstance", "rds:StopDBInstance"]
      Resource = aws_db_instance.main.arn
    }]
  })
}

resource "aws_scheduler_schedule" "start" {
  count = var.enable_keepalive_schedule ? 1 : 0

  name                         = "${var.project_name}-rds-start"
  schedule_expression          = "cron(0 9 * * ? *)"
  schedule_expression_timezone = "Asia/Tokyo"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:startDBInstance"
    role_arn = aws_iam_role.rds_schedule[0].arn
    input    = jsonencode({ DbInstanceIdentifier = aws_db_instance.main.identifier })
  }
}

resource "aws_scheduler_schedule" "stop" {
  count = var.enable_keepalive_schedule ? 1 : 0

  name                         = "${var.project_name}-rds-stop"
  schedule_expression          = "cron(10 9 * * ? *)"
  schedule_expression_timezone = "Asia/Tokyo"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance"
    role_arn = aws_iam_role.rds_schedule[0].arn
    input    = jsonencode({ DbInstanceIdentifier = aws_db_instance.main.identifier })
  }
}
