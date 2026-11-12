# DLQ(デッドレターキュー)。maxReceiveCountを超えて処理失敗したメッセージが転送される先。
# 先にDLQを定義するのは、メインキューのredrive_policyがDLQのarnを参照するため(依存関係の順)。
resource "aws_sqs_queue" "user_import_dlq" {
  name = "${var.project_name}-user-import-jobs-queue-dlq"

  tags = {
    Name    = "${var.project_name}-user-import-jobs-queue-dlq"
    Project = var.project_name
  }
}

# メインキュー。backendのUserImportListenerがロングポーリングで受信する。
resource "aws_sqs_queue" "user_import" {
  name = "${var.project_name}-user-import-jobs-queue"

  # 1件のメッセージを受信してから300秒間、他のECSタスク(コンシューマ)からは
  # そのメッセージが見えなくなる。スケールアウトして複数タスクが同じキューを
  # ポーリングしても、同じCSV行が二重に処理されないようにするための排他制御
  visibility_timeout_seconds = 300

  # 一定回数受信に失敗し続けたメッセージをDLQへ転送する設定
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.user_import_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name    = "${var.project_name}-user-import-jobs-queue"
    Project = var.project_name
  }
}