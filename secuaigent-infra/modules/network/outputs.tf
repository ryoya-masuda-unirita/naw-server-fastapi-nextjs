// VPCのID
output "vpc_id" {
  value = aws_vpc.main.id
}

// publicサブネットのID(キー順)
output "public_subnet_ids" {
  value = [for s in aws_subnet.public : s.id]
}

// privateサブネットのID(キー順)
output "private_subnet_ids" {
  value = [for s in aws_subnet.private : s.id]
}

// publicサブネットのID(キー付き。踏み台が先頭の1つを選ぶのに使う)
output "public_subnet_ids_by_key" {
  value = { for k, s in aws_subnet.public : k => s.id }
}

// ALBのセキュリティグループID
output "alb_sg_id" {
  value = aws_security_group.alb.id
}

// ECSのセキュリティグループID
output "ecs_sg_id" {
  value = aws_security_group.ecs.id
}

// RDSのセキュリティグループID
output "rds_sg_id" {
  value = aws_security_group.rds.id
}

// ElastiCacheのセキュリティグループID
output "elasticache_sg_id" {
  value = aws_security_group.elasticache.id
}

// 踏み台のセキュリティグループID
output "bastion_sg_id" {
  value = aws_security_group.bastion.id
}
