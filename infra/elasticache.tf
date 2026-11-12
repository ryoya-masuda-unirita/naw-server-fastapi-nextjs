resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-elasticache-subnet-group"
  subnet_ids = [for s in aws_subnet.private : s.id]
  tags = {
    Name    = "${var.project_name}-elasticache-subnet-group"
    Project = var.project_name
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-redis"
  description          = "Redis for ${var.project_name}"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_clusters   = 1
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.elasticache.id]

  tags = {
    Name    = "${var.project_name}-redis"
    Project = var.project_name
  }
}