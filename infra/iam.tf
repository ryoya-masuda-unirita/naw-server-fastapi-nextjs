// ECSタスク自体（コンテナ）が起動する際に「引き受ける」ロール。
// assume_role_policyでこのロールを引き受けられる主体をecs-tasks.amazonaws.comに限定している。
// 実際の権限（何ができるか）は下のaws_iam_role_policy_attachmentでアタッチする。
// ECRからのイメージpull・CloudWatch Logsへのログ書き込みに使われる。
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

// AWSが用意している既製の権限ポリシー(AmazonECSTaskExecutionRolePolicy)を
// 上のecs_task_executionロールにアタッチする。ECR pull・CloudWatch Logs書き込み権限が一通り含まれる。
resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

// ECSクラスタに参加するEC2インスタンス自体が引き受けるロール。
// assume_role_policyでec2.amazonaws.comだけがこのロールを引き受けられるようにしている。
// EC2上で常駐するECSエージェントが、クラスタとの通信（タスク登録状況の報告等）に使う。
resource "aws_iam_role" "ecs_instance" {
  name = "${var.project_name}-ecs-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

// AWSが用意している既製の権限ポリシー(AmazonEC2ContainerServiceforEC2Role)を
// 上のecs_instanceロールにアタッチする。ECSエージェントがクラスタと通信するための権限が含まれる。
resource "aws_iam_role_policy_attachment" "ecs_instance" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

// EC2はIAMロールを直接アタッチできず、必ずインスタンスプロファイルという箱を経由する必要がある。
// ここでecs_instanceロールを箱に詰め、aws_launch_template側からこのインスタンスプロファイルを参照する。
resource "aws_iam_instance_profile" "ecs" {
  name = "${var.project_name}-ecs-instance-profile"
  role = aws_iam_role.ecs_instance.name
}

// ECSタスク(コンテナ)内で動くbackendアプリコード(boto3等)が引き受けるロール。
// execution_role_arn(ecs_task_execution、ECR pull/CloudWatch Logs用)とは役割が異なるため分離する。
// この時点ではまだ「何ができるか」は無く、器(引き受け元の許可)だけを定義している。
resource "aws_iam_role" "backend_task" {
  name = "${var.project_name}-backend-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

// backendがユーザーインポート用SQS/S3を操作するためのインラインポリシー。
// backend/app/services/user_import_queue_service.py・user_import_listener.py・
// app/core/file_storage.pyで実際に呼ばれているSDK操作にのみ対応するActionを許可する。
// 対象リソースをこのキュー・バケットのみに限定する(ワイルドカードを使わない)。
resource "aws_iam_role_policy" "backend_task_sqs_s3" {
  name = "${var.project_name}-backend-task-sqs-s3-policy"
  role = aws_iam_role.backend_task.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        // アップロード時のSendMessage、リスナーのReceiveMessage/DeleteMessageに対応。
        // GetQueueAttributesはロングポーリング(WaitTimeSeconds)の内部処理で使われるため含める。
        Sid    = "UserImportQueueAccess"
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        // キュー自体のARNを指定(オブジェクト単位の概念が無いため/*は付けない)
        Resource = [
          aws_sqs_queue.user_import.arn
        ]
      },
      {
        // CSVアップロード(PutObject)・リスナーでの読み込み(GetObject)・後始末の削除(DeleteObject)に対応
        Sid    = "UserImportBucketAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        // オブジェクトに対する操作のため、バケットARNの末尾に/*を付けてスコープを絞る
        Resource = [
          "${aws_s3_bucket.user_import.arn}/*"
        ]
      }
    ]
  })
}