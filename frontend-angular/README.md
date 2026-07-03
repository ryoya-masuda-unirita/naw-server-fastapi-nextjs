# Example

このプロジェクトは [Angular CLI](https://github.com/angular/angular-cli) バージョン 21.1.0 を使用して生成されました。

## 開発環境のセットアップ

このプロジェクトはGitフックを使用してコードフォーマットの一貫性を強制しています。全メンバーはフックが有効になっていることを **必ず** 確認してください。

1.  Angular CLI（`ng`）をグローバルにインストールします（未インストールの場合）:

    ```bash
    npm install -g @angular/cli
    ```

2.  依存パッケージをインストールします:

    ```bash
    npm install
    ```

    これにより Husky が自動的に設定されます。

3.  問題が発生した場合は、手動でフックを有効化してください:
    ```bash
    npm run prepare
    ```

ファイルをコミットすると、`prettier` が `*.ts`、`*.html`、`*.scss` ファイルを自動的にフォーマットします。フォーマットやリントに失敗したコードはコミットできません。

## ローカル開発サーバー

### 1. environment.local.ts を作成する

`src/environments/environment.local.ts` はGit管理対象外のため、初回セットアップ時に手動で以下を例に作成してください。

```typescript
export const environment = {
  production: false,
  apiBaseUrl: '/api',
  authBaseUrl: '', // 空で追加してください。
  enableMock: false,
  minPasswordLength: 5,
};
```

### 2. バックエンドサーバーを起動する

バックエンド（`naw-server`）を事前に起動しておいてください。詳細は `naw-server` の README を参照してください。

### 3. フロントエンドサーバーを起動する

```bash
npm run start:local
# または
ng serve --configuration=local
```

サーバーが起動したら、ブラウザで以下のURLを開いてください。ソースファイルを変更するたびにアプリケーションが自動的にリロードされます。

| 用途 | URL |
|---|---|
| 通常アクセス | `http://localhost:4200/` |
| バックエンドと接続して動作確認 | `http://test-tenant.localhost:4200/` |

> バックエンドと接続する場合はサブドメイン形式のURLを使用してください。テナントIDがホスト名から自動的に取得されます。

## コードの雛形生成

Angular CLI には強力なコード生成ツールが含まれています。新しいコンポーネントを生成するには以下を実行します:

```bash
ng generate component component-name
```

利用可能なスキーマ（`components`、`directives`、`pipes` など）の一覧を確認するには:

```bash
ng generate --help
```

## ビルド

プロジェクトをビルドするには以下を実行します:

```bash
ng build
```

プロジェクトがコンパイルされ、ビルド成果物が `dist/` ディレクトリに格納されます。デフォルトではプロダクションビルドがパフォーマンスと速度のために最適化されます。

## ユニットテストの実行

### CLIで実行

```bash
# Angular CLI 経由（ng test のラッパー）
npm test

# Vitest を直接実行（VSCode 拡張機能と同じ設定）
npx vitest run
```

### VSCode / Cursor 拡張機能で実行

[Vitest 拡張機能](https://marketplace.visualstudio.com/items?itemName=vitest.explorer) をインストールすると、エディタ上でテストを個別に実行・デバッグできます。

設定ファイル: `vitest.config.ts`

`.vscode/settings.json` に以下を設定してください｡:

```json
{
  "vitest.enable": true,
  "vitest.rootConfig": "vitest.config.ts"
}
```

## E2Eテストの実行

E2E（エンドツーエンド）テストを実行するには:

```bash
ng e2e
```

Angular CLI にはデフォルトでE2Eテストフレームワークが含まれていません。ニーズに合ったものを選択してください。

## 参考リソース

Angular CLI の使い方（詳細なコマンドリファレンスを含む）については、[Angular CLI 概要とコマンドリファレンス](https://angular.dev/tools/cli) を参照してください。
