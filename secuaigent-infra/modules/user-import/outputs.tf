// ユーザーインポート用S3バケット名
output "bucket_name" {
  value = aws_s3_bucket.user_import.bucket
}

// ユーザーインポート用S3バケットのARN
output "bucket_arn" {
  value = aws_s3_bucket.user_import.arn
}

// ユーザーインポート用SQSキューのURL
output "queue_url" {
  value = aws_sqs_queue.user_import.url
}

// ユーザーインポート用SQSキューのARN
output "queue_arn" {
  value = aws_sqs_queue.user_import.arn
}
