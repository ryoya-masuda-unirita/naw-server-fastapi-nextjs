import { TagItem } from '@app-types/admin/library.types';

export interface TagsListResponse {
  data: TagItem[];
  total: number;
}

export const MOCK_TAG_ITEMS: TagItem[] = [
  {
    id: '1',
    name: 'タグタグタグ',
    description:
      '説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト',
    updatedAt: '2025-09-29T20:05:00.000Z',
  },
  {
    id: 'tag-002',
    name: 'タグB',
    description: '製品関連のタグ',
    updatedAt: '2025-09-28T00:00:00.000Z',
  },
  { id: 'tag-003', name: 'タグC', updatedAt: '2025-09-27T00:00:00.000Z' },
  {
    id: 'tag-004',
    name: 'タグD',
    description: '内部ドキュメント',
    updatedAt: '2025-09-26T00:00:00.000Z',
  },
  { id: 'tag-005', name: 'タグE', updatedAt: '2025-09-25T00:00:00.000Z' },
  {
    id: 'tag-006',
    name: 'タグF',
    description: '顧客向け資料',
    updatedAt: '2025-09-24T00:00:00.000Z',
  },
  { id: 'tag-007', name: 'タグG', updatedAt: '2025-09-23T00:00:00.000Z' },
];
