import type { SelectOption } from '@app-types/common';
import type { CreateIndexPayload } from '../services/training-api.service';

export type TrainingFolderType = 'SAAS_GLOBAL' | 'LOCAL';
export type TenantEndpointType = 'LOCAL_SERVER' | 'VDB' | 'AZURE_OPENAI_EMBEDDING';

export const SAAS_GLOBAL_ENDPOINT_TYPES = ['VDB', 'AZURE_OPENAI_EMBEDDING'] as const;
export type SaasGlobalEndpointType = (typeof SAAS_GLOBAL_ENDPOINT_TYPES)[number];

export const LOCAL_FOLDER_ENDPOINT_TYPE: TenantEndpointType = 'LOCAL_SERVER';

export interface TenantEndpointOption {
  id: string;
  endpointName: string;
  type: string;
}

export interface FolderFormValues {
  name: string;
  server: TrainingFolderType;
  description?: string;
  fetchId?: string;
  deleteId?: string;
  learnId?: string;
}

export function toEndpointSelectOptions(endpoints: TenantEndpointOption[]): SelectOption[] {
  return endpoints.map((endpoint) => ({
    value: endpoint.id,
    label: endpoint.endpointName,
  }));
}

export function resolveInitialEndpointId(
  options: SelectOption[],
  existingEndpointId?: string,
): string | null {
  if (options.length === 0) return null;
  if (existingEndpointId && options.some((option) => option.value === existingEndpointId)) {
    return String(existingEndpointId);
  }
  return String(options[0].value);
}

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

export function normalizeTenantEndpointsResponse(raw: unknown): TenantEndpointOption[] {
  const rows = extractEndpointRows(raw);
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const record = row as Record<string, unknown>;
      const id = String(record['id'] ?? '').trim();
      if (!id) return null;
      return {
        id,
        endpointName: String(record['endpointName'] ?? record['label'] ?? id).trim(),
        type: String(record['type'] ?? '').trim(),
      };
    })
    .filter((endpoint): endpoint is TenantEndpointOption => endpoint !== null);
}

function extractEndpointRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record['data'])) return record['data'];
    if (record['id']) return [raw];
  }
  return [];
}
