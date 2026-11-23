// ユーザーインポート用CSVを一時保存するS3バケット。backendがアップロード・SQSリスナーが読み込みに使う。
resource "aws_s3_bucket" "user_import" {
  bucket = "${var.project_name}-user-import-jobs"

  // 中身が空でないとterraform destroyが失敗するため、destroy時にオブジェクトごと削除させる
  force_destroy = true

  tags = {
    Name    = "${var.project_name}-user-import-jobs"
    Project = var.project_name
  }
}

// バケットへのパブリックアクセスを全面的にブロックする(backendアプリがSDK経由で直接アクセスするのみで、
// CloudFront等の外部公開経路を持たないため)
resource "aws_s3_bucket_public_access_block" "user_import" {
  bucket = aws_s3_bucket.user_import.id

  // 新規に付与されるパブリックACLを拒否する
  block_public_acls = true
  // パブリックアクセスを許可するバケットポリシーの設定自体を拒否する
  block_public_policy = true
  // 既存のパブリックACLが付いていても、それを無視して非公開として扱う
  ignore_public_acls = true
  // 上記でパブリックとみなされるACL/ポリシーが設定されていても、実際のパブリックアクセスを遮断する
  restrict_public_buckets = true
}

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