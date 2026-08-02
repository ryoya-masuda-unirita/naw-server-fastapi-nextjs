// Terraform state(tfstate)を保管するS3バケット。CIからの自動applyとローカル手動操作でstateを共有するために使う。
resource "aws_s3_bucket" "tfstate" {
  bucket = "${var.project_name}-tfstate"

  // バージョニング有効のバケットは、objectを削除してもバージョンが残り「空に見えない」状態になり、
  // force_destroyが無いとterraform destroyがBucketNotEmptyで失敗する。frontend用バケットと同様に設定する。
  force_destroy = true

  tags = {
    Name    = "${var.project_name}-tfstate"
    Project = var.project_name
  }
}

// tfstateには機密情報(DBパスワード等)が平文で含まれるため、パブリックアクセスを全面的にブロックする
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  // 新規に付与されるパブリックACLを拒否する
  block_public_acls = true
  // パブリックアクセスを許可するバケットポリシーの設定自体を拒否する
  block_public_policy = true
  // 既存のパブリックACLが付いていても、それを無視して非公開として扱う
  ignore_public_acls = true
  // 上記でパブリックとみなされるACL/ポリシーが設定されていても、実際のパブリックアクセスを遮断する
  restrict_public_buckets = true
}

// 誤ってstateを上書き・削除してしまった場合に復元できるよう、バージョニングを有効化する
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}