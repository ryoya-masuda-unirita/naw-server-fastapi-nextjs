resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-backend"
  image_tag_mutability = "MUTABLE"
  // イメージが残っているとterraform destroyが失敗するため、destroy時にイメージごと削除させる
  force_delete = true
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = {
    Name    = "${var.project_name}-backend"
    Project = var.project_name
  }
}