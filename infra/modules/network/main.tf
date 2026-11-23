resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags = {
    Name    = "${var.project_name}-vpc"
    Project = var.project_name
  }
}

resource "aws_subnet" "public" {
  for_each = {
    "1a" = "10.0.1.0/24"
    "1c" = "10.0.2.0/24"
  }
  vpc_id                  = aws_vpc.main.id # 作成したVPCのIDを参照する
  cidr_block              = each.value
  availability_zone       = "ap-northeast-${each.key}"
  map_public_ip_on_launch = true # このサブネットで起動したインスタンスに自動でパブリックIPを割り当てる

  tags = {
    Name    = "${var.project_name}-public-${each.key}"
    Project = var.project_name
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name    = "${var.project_name}-igw"
    Project = var.project_name
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name    = "${var.project_name}-public-rt"
    Project = var.project_name
  }
}

// サブネットとルートテーブルを紐づける
resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

// privateルートテーブル
resource "aws_subnet" "private" {
  for_each = {
    "1a" = "10.0.11.0/24"
    "1c" = "10.0.12.0/24"
  }
  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value
  availability_zone = "ap-northeast-${each.key}"
  tags = {
    Name           = "${var.project_name}-private-${each.key}"
    Project        = var.project_name
    RouteTableType = "private"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  # routeブロックなし＝localルートのみ

  tags = {
    Name    = "${var.project_name}-private-rt"
    Project = var.project_name
  }
}

// サブネットとルートテーブルを紐づける
resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}




resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-sg-bastion"
  description = "Bastion SSH access"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name    = "${var.project_name}-sg-bastion"
    Project = var.project_name
  }
}

resource "aws_security_group_rule" "bastion_ssh_in" {
  // インバウンド、外から入ってくる通信
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = var.allowed_ssh_cidrs
  security_group_id = aws_security_group.bastion.id
}

resource "aws_security_group" "alb" {
  name        = "${var.project_name}-sg-alb"
  description = "ALB HTTP access"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name    = "${var.project_name}-sg-alb"
    Project = var.project_name
  }
}

// 管理者がcurlで叩けるようにするためのrule
resource "aws_security_group_rule" "alb_http_in_admin" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = var.allowed_admin_cidrs
  security_group_id = aws_security_group.alb.id
}

// CloudFrontからのアクセスを許可するためのrule
resource "aws_security_group_rule" "alb_http_in_cloudfront" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  prefix_list_ids   = ["pl-58a04531"] # CloudFrontのオリジン向けIP範囲(ap-northeast-1での)
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group" "ecs" {
  name        = "${var.project_name}-sg-ecs"
  description = "ECS task access from alb"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name    = "${var.project_name}-sg-ecs"
    Project = var.project_name
  }
}

// ECSのEC2はECR/ECS API/CloudWatch LogsなどAWSサービスへの通信が必須。
// エンドポイントの範囲が広く変わりうるため、絞らず全egressを許可する。
resource "aws_security_group_rule" "ecs_all_out" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ecs.id
}

resource "aws_security_group_rule" "ecs_http_in_alb" {
  type      = "ingress"
  from_port = 8000
  to_port   = 8000
  protocol  = "tcp"
  // このルールが属するSG
  security_group_id = aws_security_group.ecs.id
  // 送信元
  source_security_group_id = aws_security_group.alb.id
}

// rds
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-sg-rds"
  description = "RDS access from ecs and bastion"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name    = "${var.project_name}-sg-rds"
    Project = var.project_name
  }
}

resource "aws_security_group_rule" "rds_postgres_in_ecs" {
  type      = "ingress"
  from_port = 5432
  to_port   = 5432
  protocol  = "tcp"
  // このルールが属するSG
  security_group_id = aws_security_group.rds.id
  // 送信元
  source_security_group_id = aws_security_group.ecs.id
}

resource "aws_security_group_rule" "rds_postgres_in_bastion" {
  type      = "ingress"
  from_port = 5432
  to_port   = 5432
  protocol  = "tcp"
  // このルールが属するSG
  security_group_id = aws_security_group.rds.id
  // 送信元
  source_security_group_id = aws_security_group.bastion.id
}

resource "aws_security_group" "elasticache" {
  name        = "${var.project_name}-sg-elasticache"
  description = "Elasticache access from ecs"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name    = "${var.project_name}-sg-elasticache"
    Project = var.project_name
  }
}

resource "aws_security_group_rule" "elasticache_redis_in_ecs" {
  type      = "ingress"
  from_port = 6379
  to_port   = 6379
  protocol  = "tcp"
  // このルールが属するSG
  security_group_id = aws_security_group.elasticache.id
  // 送信元
  source_security_group_id = aws_security_group.ecs.id
}

// bastionはRDSへの接続(5432)と、OS/セキュリティパッチ更新用のHTTPS(443)のみを許可する。
resource "aws_security_group_rule" "bastion_postgres_out" {
  type      = "egress"
  from_port = 5432
  to_port   = 5432
  protocol  = "tcp"
  // このルールが属するSG
  security_group_id = aws_security_group.bastion.id
  // 送信先(egressでもフィールド名はsource_security_group_id)
  source_security_group_id = aws_security_group.rds.id
}

resource "aws_security_group_rule" "bastion_https_out" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.bastion.id
}

// ALBはbackend(ECS、8000番)への転送のみ行うため、そこだけ許可する。
resource "aws_security_group_rule" "alb_ecs_out" {
  type      = "egress"
  from_port = 8000
  to_port   = 8000
  protocol  = "tcp"
  // このルールが属するSG
  security_group_id = aws_security_group.alb.id
  // 送信先(egressでもフィールド名はsource_security_group_id)
  source_security_group_id = aws_security_group.ecs.id
}

// RDS/ElastiCacheは検証コストに見合わないため絞らず全egressを許可する。
resource "aws_security_group_rule" "rds_all_out" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.rds.id
}

resource "aws_security_group_rule" "elasticache_all_out" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.elasticache.id
}

