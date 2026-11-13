export interface AdminAssistantCategory {
  id: string;
  name: string;
  desc: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── API Contract Types ─────────────────────────────────────

export interface AssistantApiItem {
  id: string;
  name: string;
  description: string;
  type: string;
  indexId?: string;
  includeHistory: boolean;
  iconColor: string;
  groups: string[];
  category: { id: string; name: string; description: string } | null;
  categories?: { id: string; name: string; description: string }[];
  endpoints: {
    id: string;
    label: string;
    model: string;
    url: string;
    type: string;
  }[];
  /** Present on group-scoped list responses. */
  addedAt?: string;
}

export interface AssistantMutationPayload {
  type: string;
  endpoints: {
    id: string;
    model: string;
    url?: string;
  }[];
  indexId?: string | null;
  groups: string[];
  name: string;
  description: string;
  includeHistory: boolean;
  iconColor: string;
  categoryIds: string[];
}

export interface AssistantApiResponse {
  data: AssistantApiItem[];
  total: number;
  page: number;
  size: number;
}

export interface AssistantCategoryApiItem {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

// ─── Filter Types ──────────────────────────────────────────

export type AssistantSortField = 'name' | 'updatedAt' | 'assistantType' | 'includeHistory';
export type AssistantSortOrder = 'asc' | 'desc';

export interface AssistantFilter {
  query: string;
  pageIndex: number;
  pageSize: number;
  sortField?: AssistantSortField;
  sortOrder?: AssistantSortOrder;
  filterServer?: string;
  filterCategory?: string;
  filterTeam?: string;
  filterTerm?: string;
  search?: string;
  excludeGroupId?: string;
}

export type AssistantCategorySortField = 'name' | 'updatedAt';
export type AssistantCategorySortOrder = 'asc' | 'desc';

export interface AssistantCategoryFilter {
  query: string;
  pageIndex: number;
  pageSize: number;
  sortField?: AssistantCategorySortField;
  sortOrder?: AssistantCategorySortOrder;
}
