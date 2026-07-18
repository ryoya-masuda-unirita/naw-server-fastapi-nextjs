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




