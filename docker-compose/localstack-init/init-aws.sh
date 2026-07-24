#!/bin/bash
set -euo pipefail

# backend側（AwsSettings.aws_region）と同じリージョンを明示しないと、
# awslocalのデフォルトリージョン（us-east-1）でキュー・バケットが作成され、
# backendからのリクエストが別リージョン扱いになり NonExistentQueue になる。
AWS_REGION=ap-northeast-1

awslocal s3 mb s3://secuaigent-user-import-jobs-dev-local --region "$AWS_REGION"
awslocal sqs create-queue \
    --queue-name secuaigent-user-import-jobs-queue-dev-local \
    --region "$AWS_REGION"
