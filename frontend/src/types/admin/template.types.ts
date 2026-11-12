/** View-model rendered by the templates list. */
export interface AdminTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  teams: string[];
  /** ISO `YYYY-MM-DDTHH:mm:ss`. Optional in older mock data. */
  updatedAt?: string;
}

/** Server contract — `/api/admin/prompt-templates` GET response item. */
export interface TemplateApiItem {
  id: string;
  tenantId?: string;
  name: string;
  description: string;
  systemPrompt: string;
  groups?: string[];
  /** ISO date-time. */
  updatedAt?: string;
  createdAt?: string;
  /** Present on group-scoped list responses. */
  addedAt?: string;
}

export interface TemplateApiResponse {
  content: TemplateApiItem[];
  totalElements: number;
  number: number;
  size: number;
}

export type TemplateSortField = 'updatedAt' | 'name' | null;
export type TemplateSortOrder = 'asc' | 'desc' | null;

export interface TemplateFilter {
  query?: string;
  search?: string;
  excludeGroupId?: string;
  pageSize: number;
  pageIndex: number;
  team?: string;
  sortField?: TemplateSortField;
  sortOrder?: TemplateSortOrder;
}
