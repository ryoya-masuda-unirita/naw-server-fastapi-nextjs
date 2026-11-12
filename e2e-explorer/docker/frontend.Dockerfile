# 今の frontend/ のソースをそのまま Vite の開発サーバーで動かす。
# 本番ビルドではなく開発サーバーにするのは、React の開発時の警告（key の重複など）も
# コンソールのエラーとして判定役が拾えるようにするため。
FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
