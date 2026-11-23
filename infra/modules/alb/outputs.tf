// ALBのDNS名
output "dns_name" {
  value = aws_lb.main.dns_name
}

// backendのターゲットグループARN。ECSサービスが登録に失敗しないよう、リスナーが先に作られるようdepends_onを付ける
output "target_group_arn" {
  value      = aws_lb_target_group.backend.arn
  depends_on = [aws_lb_listener.http]
}
