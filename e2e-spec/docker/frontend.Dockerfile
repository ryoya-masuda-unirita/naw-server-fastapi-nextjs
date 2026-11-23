# 専用環境の画面。Vite の開発サーバーではなく、ビルド済みの静的ファイルを nginx で配信する（#417）。
# 開発サーバーは通し実行中にアイドルでも CPU・メモリを大きく使い、並列実行で画面の応答が遅れて
# 負荷による NG が出たため、本番（CloudFront + S3 の静的配信）に近い形にする。
FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_* はビルド時にバンドルへ埋め込まれる。ブラウザ（ホスト）から見た backend の URL を渡す。
# .env.production は VITE_API_URL を空・VITE_AUTH_API_URL を /backend にする（CloudFront 前提）が、
# 専用環境では backend を直接呼ぶので、シェルの環境変数で両方を上書きする（開発サーバーの挙動と揃える）。
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_AUTH_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 5173
