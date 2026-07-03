import { inject, Injectable } from '@angular/core';
import type { GlossaryTagItem } from '@app-types/admin/glossary.types';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';

export interface GlossaryTagsListResponse {
  data: Array<Omit<GlossaryTagItem, 'updatedDate'> & { updatedDate: string }>;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class GlossaryTagsApiService {
  private readonly api = inject(ApiClientService);

  async list(): Promise<GlossaryTagsListResponse> {
    return this.api.get<GlossaryTagsListResponse>(API_PATHS.GLOSSARY.TAGS);
  }

  async create(input: { name: string; description?: string }): Promise<{ data: GlossaryTagItem }> {
    console.log('[Glossary] TAG_CREATE', input);
    return this.api.post<{ data: GlossaryTagItem }>(API_PATHS.GLOSSARY.TAGS, input);
  }

  async update(
    id: string,
    input: { name?: string; description?: string },
  ): Promise<{ data: GlossaryTagItem }> {
    console.log('[Glossary] TAG_UPDATE', { id, ...input });
    return this.api.patch<{ data: GlossaryTagItem }>(API_PATHS.GLOSSARY.TAG_DETAIL(id), input);
  }

  async delete(id: string): Promise<{ data: { id: string } }> {
    console.log('[Glossary] TAG_DELETE', { id });
    return this.api.delete<{ data: { id: string } }>(API_PATHS.GLOSSARY.TAG_DETAIL(id));
  }
}
