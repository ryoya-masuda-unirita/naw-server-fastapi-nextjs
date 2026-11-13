import type { SelectOption } from '@/components/shared/types';

// 移植元 training-data/utils/training-folder-form.helper.ts のうち、フォルダの新規作成で使う分。
// 既存フォルダの編集（既存のエンドポイントを選んだままにする処理）は詳細画面（#290）で足す。

export type TrainingFolderType = 'SAAS_GLOBAL' | 'LOCAL';
export type TenantEndpointType = 'LOCAL_SERVER' | 'VDB' | 'AZURE_OPENAI_EMBEDDING';

/** クラウド接続のとき、ベクトル DB・埋め込みモデルの順に 1 つずつ選ぶ */
export const SAAS_GLOBAL_ENDPOINT_TYPES = ['VDB', 'AZURE_OPENAI_EMBEDDING'] as const;

export const LOCAL_FOLDER_ENDPOINT_TYPE: TenantEndpointType = 'LOCAL_SERVER';

/** `GET /api/admin/tenants/endpoints/{type}` の 1 件（使う項目だけ） */
export interface TenantEndpointOption {
  id: string;
  endpointName: string;
}

/** 移植元 `Index` の書き込み本文（`IndexCreateRequest`） */
export interface CreateIndexPayload {
  name: string;
  type: TrainingFolderType;
  description?: string;
  add?: string;
  delete?: string;
  get?: string;
  endpointIds: string[];
  groupIds: string[];
}

export interface FolderFormValues {
  name: string;
  server: TrainingFolderType;
  description?: string;
  fetchId?: string;
  deleteId?: string;
  learnId?: string;
}

/** エンドポイントの一覧を、値が ID・表示が名前の選択肢に変える */
export function toEndpointSelectOptions(endpoints: TenantEndpointOption[]): SelectOption[] {
  return endpoints.map((endpoint) => ({ value: endpoint.id, label: endpoint.endpointName }));
}

/** 選択肢の先頭の ID（移植元 `resolveInitialEndpointId` の、既存の ID を指定しない場合）。空なら null */
export function resolveInitialEndpointId(options: SelectOption[]): string | null {
  return options.length === 0 ? null : String(options[0].value);
}

/** クラウド接続で使う [ベクトル DB の ID, 埋め込みモデルの ID]（それぞれ先頭）。どちらかが空なら null */
export function resolveSaasGlobalEndpointIds(
  vdbOptions: SelectOption[],
  embeddingOptions: SelectOption[],
): string[] | null {
  const vdbId = resolveInitialEndpointId(vdbOptions);
  const embeddingId = resolveInitialEndpointId(embeddingOptions);
  if (!vdbId || !embeddingId) return null;
  return [vdbId, embeddingId];
}

/** フォームの値から作成 API の本文を作る。サービス ID（取得・削除・学習）はローカル接続のときだけ送る */
export function buildIndexPayload(
  values: FolderFormValues,
  groupIds: string[],
  endpointIds: string[],
): CreateIndexPayload {
  const isLocal = values.server === 'LOCAL';

  return {
    name: values.name,
    type: values.server,
    description: values.description || undefined,
    ...(isLocal
      ? {
          get: values.fetchId || undefined,
          delete: values.deleteId || undefined,
          add: values.learnId || undefined,
        }
      : {}),
    endpointIds,
    groupIds,
  };
}
