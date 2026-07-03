import { inject, Injectable } from '@angular/core';
import type { GlossaryItem } from '@app-types/admin/glossary.types';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';

export interface UserGlossaryTermsListResponse {
  data: (Omit<GlossaryItem, 'editedDate'> & { editedDate: string })[];
  total: number;
  page: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class UserGlossaryTermsApiService {
  private readonly api = inject(ApiClientService);

  async list(params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    category?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<UserGlossaryTermsListResponse> {
    return this.api.get<UserGlossaryTermsListResponse>(API_PATHS.USER_GLOSSARY.TERMS, { params });
  }

  async getById(id: string): Promise<Omit<GlossaryItem, 'editedDate'> & { editedDate: string }> {
    return this.api.get<Omit<GlossaryItem, 'editedDate'> & { editedDate: string }>(
      API_PATHS.USER_GLOSSARY.TERM_DETAIL(id),
    );
  }
}
