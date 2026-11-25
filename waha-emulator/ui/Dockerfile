# ワークフローエディター（画面）をビルドし、静的ファイルとして配信する。
# /admin/ だけを、エミュレーターへ中継する（開発サーバーのプロキシと同じ役割）。
# ビルドコンテキストは waha-emulator/ui（onprem/docker-compose.yml の build）
FROM node:24-alpine AS build
WORKDIR /app

# 依存の定義だけを先にコピーし、ソースの変更で依存の層が作り直されないようにする
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.29-alpine
# nginx の公式イメージは、/etc/nginx/templates の *.template を、環境変数で置き換えて
# conf.d に書く（WAHA_UPSTREAM は compose で指定する）
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
