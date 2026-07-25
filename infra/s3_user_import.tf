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

