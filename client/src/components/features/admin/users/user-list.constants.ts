import type { UserFilter } from '@/types/admin/user.types';

/** 既定の一覧条件（移植元 user-list.constants.ts）。role・query を持たないので USER などもすべて含む */
export const INITIAL_USER_LIST_FILTER: UserFilter = {
  pageSize: 10,
  pageIndex: 1,
  sortField: 'name',
  sortOrder: 'asc',
};

/** 追加・編集ダイアログの表示名・ユーザーIDの最大文字数（移植元 Validators.maxLength(100)） */
export const USER_TEXT_MAX_LENGTH = 100;
