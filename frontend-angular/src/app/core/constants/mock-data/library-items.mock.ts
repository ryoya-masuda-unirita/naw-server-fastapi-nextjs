import { LibraryItem, LibraryListResponse, LibraryPageItem } from '@app-types/admin/library.types';

export type { LibraryListResponse };

export interface SaveLibraryRequest {
  contentName: string;
  tagIds: string[];
  teamIds: string[];
  chatId?: string;
}

export interface SaveLibraryResponse {
  data: LibraryItem;
}

export interface LibraryContentItem {
  id: string;
  title: string;
}

export const MOCK_LIBRARY_CONTENT_LIST: LibraryContentItem[] = [
  { id: '1', title: '部門別 予実対比 2025 Q3' },
  { id: '2', title: '別の生成内容' },
  { id: '3', title: '別の生成内容' },
  { id: '4', title: '別の生成内容' },
  { id: '5', title: '別の生成内容' },
  { id: '6', title: '別の生成内容' },
];

export const MOCK_LIBRARY_ITEMS: LibraryItem[] = [
  {
    id: '1',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '2',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'video',
  },
  {
    id: '3',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '4',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'image',
  },
  {
    id: '5',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '6',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '7',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'video',
  },
  {
    id: '8',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'image',
  },
  {
    id: '9',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '10',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '11',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '12',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'video',
  },
  {
    id: '13',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '14',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'image',
  },
  {
    id: '15',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '16',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '17',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'video',
  },
  {
    id: '18',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'image',
  },
  {
    id: '19',
    name: 'コンテンツの名前コンテンツの名前 v3.0',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '20',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '21',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '22',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '23',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'video',
  },
  {
    id: '24',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '25',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '26',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'image',
  },
  {
    id: '27',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
  {
    id: '28',
    name: 'コンテンツの名前コンテンツの名前',
    tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    createdDate: new Date('2025-09-29'),
    creator: '苗字 名前名前',
    contentType: 'document',
  },
];

export const MOCK_LIBRARY_PAGE_ITEMS: LibraryPageItem[] = Array.from({ length: 28 }, (_, i) => {
  const index = i + 1;
  return {
    id: String(index),
    title:
      index === 19 ? 'コンテンツの名前コンテンツの名前 v3.0' : 'コンテンツの名前コンテンツの名前',
    userId: index % 3 === 0 ? 'user-002' : 'user-001',
    updatedAt: new Date(2025, 8, 29 - (index % 10)).toISOString(),
    tags:
      index % 8 === 0
        ? [{ id: '1', name: 'タグタグタグ' }]
        : [
            { id: '1', name: 'タグタグタグ' },
            { id: 'tag-002', name: 'タグB' },
          ],
    sharedGroups: index % 2 === 0 ? [{ id: '1', name: 'グループA' }] : [],
  };
});
