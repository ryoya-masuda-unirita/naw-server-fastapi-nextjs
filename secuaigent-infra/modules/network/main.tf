locals {
  // サブネットを置くAZの識別子(ap-northeast-<識別子>)。サブネットのキー・名前に使うため、変えない。
  az_suffixes = ["1a", "1c"]
}

resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  // Fargateのタスクやエンドポイントが名前解決できるよう、DNSを有効にする
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_subnet" "public" {
  // VPCのCIDRから計算する(public: 先頭から、private: 10番目から)
  for_each                = { for i, az in local.az_suffixes : az => cidrsubnet(var.vpc_cidr, 8, i) }
  vpc_id                  = aws_vpc.main.id # 作成したVPCのIDを参照する
  cidr_block              = each.value
  availability_zone       = "ap-northeast-${each.key}"
  map_public_ip_on_launch = true # このサブネットで起動したインスタンスに自動でパブリックIPを割り当てる

  tags = {
    Name = "${var.project_name}-public-${each.key}"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

// サブネットとルートテーブルを紐づける
resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

// privateサブネット(ルートテーブルは、下のaws_route_table.privateで割り当てる)
resource "aws_subnet" "private" {
  for_each          = { for i, az in local.az_suffixes : az => cidrsubnet(var.vpc_cidr, 8, i + 10) }
  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value
  availability_zone = "ap-northeast-${each.key}"
  tags = {
    Name           = "${var.project_name}-private-${each.key}"
    RouteTableType = "private"
  }
}

// privateサブネットのFargateタスクが、ECRからのイメージ取得・ログ送信などで外に出るためのNAT。
// 1台のみ(先頭のpublicサブネット)。そのAZが落ちるとprivateからの外向き通信が止まるが、固定費を抑えるため移植元と同じ構成にする。
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[local.az_suffixes[0]].id

  tags = {
    Name = "${var.project_name}-nat"
  }

  // NATはインターネットゲートウェイ経由で外に出るため、IGWが先に必要
  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  // 外向きの通信はNAT経由(それ以外のVPC内の通信はlocalルートで足りる)
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-private-rt"
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
    Name = "${var.project_name}-sg-bastion"
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
    Name = "${var.project_name}-sg-alb"
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
  prefix_list_ids   = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group" "ecs" {
  name        = "${var.project_name}-sg-ecs"
  description = "ECS task access from alb"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-sg-ecs"
  }
}

// ECS(Fargate)のタスクは、ECR/ECS API/CloudWatch LogsなどAWSサービスへの通信が必須。
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
    Name = "${var.project_name}-sg-rds"
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
    Name = "${var.project_name}-sg-elasticache"
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

// CloudFrontのオリジン向けIP範囲。IDはリージョンごとに違うため、直書きせず名前から引く。
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}
