import { TrainingDataApiItem } from '@app-types/training-data.types';

const DESCRIPTION_DUMMY =
  'フォルダの使用説明が入ります。フォルダの使用説明が入ります。フォルダの使用説明が入ります。フォルダの使用説明が入ります。フォルダの使用説明が入ります。, 苗字 名前, 苗字 名前, 苗字 名前, 苗字 名前, 苗字 名前, ';

const MOCK_FILES = Array.from({ length: 4 }, (_, i) => ({
  id: `file-${i + 1}`,
  displayName: 'コンプライアンスガイドライン',
  name: 'コンプライアンスガイドライン.docx',
  updatedAt: '2025/09/29 20:05',
  updatedBy: '苗字 名前',
  status: 'ENABLE' as const,
  image: 'dummy-image01.jpg',
}));

export const MOCK_TRAINING_INDEXES: TrainingDataApiItem[] = Array.from({ length: 28 }, (_, i) => {
  const id = `idx-${i + 1}`;
  const charCode = 65 + (i % 26);
  const prefix = i >= 26 ? 'A' : '';
  const name = `フォルダ${prefix}${String.fromCharCode(charCode)}`;
  const type: 'LOCAL' | 'SAAS_GLOBAL' = i < 2 ? 'LOCAL' : 'SAAS_GLOBAL';

  return {
    id,
    name,
    type,
    description: DESCRIPTION_DUMMY,
    updatedAt: new Date(2025, 8, 30 - i).toISOString(),
    get: type === 'LOCAL' ? `service-fetch-${i + 1}` : undefined,
    add: type === 'LOCAL' ? `service-learn-${i + 1}` : undefined,
    delete: type === 'LOCAL' ? `service-delete-${i + 1}` : undefined,
    files: MOCK_FILES,
  };
});
