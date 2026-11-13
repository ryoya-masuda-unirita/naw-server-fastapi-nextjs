import type { SelectOption } from '@/components/shared/types';

// 移植元 training-data/utils/training-folder-form.helper.ts。
// 新規作成（一覧）と、既存フォルダの編集（詳細）で使う。

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

/**
 * 選択肢のうち使う ID。既存の ID が選択肢にあればそれ、なければ先頭。選択肢が空なら null
 * （移植元 `resolveInitialEndpointId`）
 */
export function resolveInitialEndpointId(
  options: SelectOption[],
  existingEndpointId?: string,
): string | null {
  if (options.length === 0) return null;
  if (existingEndpointId && options.some((option) => option.value === existingEndpointId)) {
    return existingEndpointId;
  }
  return String(options[0].value);
}

/**
 * クラウド接続で使う [ベクトル DB の ID, 埋め込みモデルの ID]。
 * 既存の ID が選択肢にあればそれを、なければそれぞれ先頭を使う。どちらかの選択肢が空なら null
 */
export function resolveSaasGlobalEndpointIds(
  vdbOptions: SelectOption[],
  embeddingOptions: SelectOption[],
  existingEndpointIds?: string[],
): string[] | null {
  if (vdbOptions.length === 0 || embeddingOptions.length === 0) return null;

  const existingVdb = existingEndpointIds?.find((id) =>
    vdbOptions.some((option) => option.value === id),
  );
  const existingEmbedding = existingEndpointIds?.find((id) =>
    embeddingOptions.some((option) => option.value === id),
  );

  const vdbId = resolveInitialEndpointId(vdbOptions, existingVdb);
  const embeddingId = resolveInitialEndpointId(embeddingOptions, existingEmbedding);
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
