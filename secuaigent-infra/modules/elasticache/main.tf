resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-elasticache-subnet-group"
  subnet_ids = var.private_subnet_ids
  tags = {
    Name = "${var.project_name}-elasticache-subnet-group"
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-redis"
  description          = "Redis for ${var.project_name}"
  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = "cache.t4g.micro"
  num_cache_clusters   = 1
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.elasticache_sg_id]

  // 1ノード構成のためフェイルオーバーは使わない
  automatic_failover_enabled = false
  // 保存時は暗号化する。通信の暗号化(TLS)は、backendが平文のredis://で接続しているため無効のままにする
  // (どちらも作成後に変えられない。変えるとレプリケーショングループの再作成になる)
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false

  tags = {
    Name = "${var.project_name}-redis"
  }
}
