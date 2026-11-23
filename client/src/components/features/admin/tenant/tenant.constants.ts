/** ワークスペース設定で追加・更新・削除できるのは、ローカルの Waha 接続先だけ（移植元 tenant.constants.ts） */
export const MANAGEABLE_ENDPOINT_TYPE = 'LOCAL_SERVER' as const;

export function isManageableEndpointType(type: string): boolean {
  return type === MANAGEABLE_ENDPOINT_TYPE;
}

/**
 * 利用状況タブの「ワークスペースの利用制限」「ユーザーの利用制限」パネルを出すか。
 * 移植元は usage-tab.component.html でこの 2 パネルをコメントアウトしており、画面には出ない。
 * 移植元に揃えて出さない（ダイアログと更新処理は移植済み。移植元でコメントアウトが外れたらここを true にする）
 */
export const SHOW_USAGE_LIMIT_PANELS = false;

/** 利用履歴の 1 ページの件数（移植元 TenantApiService.USAGE_HISTORY_PAGE_SIZE） */
export const USAGE_HISTORY_PAGE_SIZE = 5;

/** 利用者の絞り込みに出すユーザーの最大件数（移植元 usage-tab の `pageSize: 500`） */
export const USAGE_FILTER_USER_LIMIT = 500;
