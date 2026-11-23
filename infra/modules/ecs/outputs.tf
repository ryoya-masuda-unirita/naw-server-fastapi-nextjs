// ECSタスク実行ロールのARN
output "execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

// backendタスクロールのARN
output "task_role_arn" {
  value = aws_iam_role.backend_task.arn
}
