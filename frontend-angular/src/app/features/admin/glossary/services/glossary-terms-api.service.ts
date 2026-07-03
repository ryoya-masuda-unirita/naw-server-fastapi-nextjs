import { inject, Injectable } from '@angular/core';
import type { GlossaryItem } from '@app-types/admin/glossary.types';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';

export interface GlossaryTermsListResponse {
  data: (Omit<GlossaryItem, 'editedDate'> & { editedDate: string })[];
  total: number;
  page: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class GlossaryTermsApiService {
  private readonly api = inject(ApiClientService);

  async list(params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    category?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<GlossaryTermsListResponse> {
    return this.api.get<GlossaryTermsListResponse>(API_PATHS.GLOSSARY.TERMS, { params });
  }

  async getById(id: string): Promise<Omit<GlossaryItem, 'editedDate'> & { editedDate: string }> {
    console.log('[Glossary] TERM_GET', { id });
    return this.api.get<Omit<GlossaryItem, 'editedDate'> & { editedDate: string }>(
      `${API_PATHS.GLOSSARY.TERMS}/${id}`,
    );
  }

  async create(input: {
    name: string;
    definition: string;
    category?: string;
    assistant?: string;
    tags?: string[];
  }): Promise<Omit<GlossaryItem, 'editedDate'> & { editedDate: string }> {
    console.log('[Glossary] TERM_CREATE', input);
    return this.api.post<Omit<GlossaryItem, 'editedDate'> & { editedDate: string }>(
      API_PATHS.GLOSSARY.TERMS,
      input,
    );
  }

  async update(
    id: string,
    input: {
      name?: string;
      definition?: string;
      category?: string;
      assistant?: string;
      tags?: string[];
    },
  ): Promise<Omit<GlossaryItem, 'editedDate'> & { editedDate: string }> {
    console.log('[Glossary] TERM_UPDATE', { id, ...input });
    return this.api.patch<Omit<GlossaryItem, 'editedDate'> & { editedDate: string }>(
      `${API_PATHS.GLOSSARY.TERMS}/${id}`,
      input,
    );
  }

  async delete(id: string): Promise<{ id: string }> {
    console.log('[Glossary] TERM_DELETE', { id });
    return this.api.delete<{ id: string }>(`${API_PATHS.GLOSSARY.TERMS}/${id}`);
  }
}
