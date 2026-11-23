// ECSタスク実行ロールのARN
output "execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

// backendタスクロールのARN
output "task_role_arn" {
  value = aws_iam_role.backend_task.arn
}

// ECSクラスタのARN。デプロイ用ロールが、マイグレーションの一時タスクの起動先を、このクラスタに限るために使う
output "cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

// ECSクラスタの名前。デプロイ用ロールが、クラスタ内のタスクのARNを組み立てるために使う
output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

// backendサービスのARN。デプロイ用ロールが、サービスの更新を、このサービスに限るために使う
output "service_arn" {
  value = aws_ecs_service.backend.id
}

// backendのタスク定義のファミリ名
output "backend_task_family" {
  value = aws_ecs_task_definition.backend.family
}

// マイグレーション用のタスク定義のファミリ名。デプロイ用ロールが、一時タスクの起動を、このタスク定義に限るために使う
output "migrate_task_family" {
  value = aws_ecs_task_definition.backend_migrate.family
}
