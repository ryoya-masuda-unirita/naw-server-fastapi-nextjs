/** ビューワーの資料（ライブラリ）の 1 件。移植元 `ViewerListItem`（core/constants/mock-data/viewer-content.mock.ts） */
export interface ViewerListItem {
  id: string;
  title: string;
}

/** GET /api/libraries/{roomId}/list。backend は `title` が null の資料も返す */
export interface ViewerListResponse {
  data: { id: string; title: string | null }[];
}
