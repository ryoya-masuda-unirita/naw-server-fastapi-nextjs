import { inject, Injectable } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import { PagedResponse } from '@app-types/api-response.type';
import { TagItem } from '@app-types/admin/library.types';

@Injectable({ providedIn: 'root' })
export class TagsApiService {
  private readonly api = inject(ApiClientService);

  async list(params: {
    page: number;
    size: number;
    sort: string;
  }): Promise<PagedResponse<TagItem>> {
    return this.api.get<PagedResponse<TagItem>>(API_PATHS.ADMIN_LIBRARY_TAGS.LIST, { params });
  }

  async create(payload: { name: string; description?: string }): Promise<TagItem> {
    return this.api.post<TagItem>(API_PATHS.ADMIN_LIBRARY_TAGS.CREATE, payload, {
      skipGlobalErrorToast: true,
    });
  }

  async update(id: string, payload: { name: string; description?: string }): Promise<TagItem> {
    return this.api.patch<TagItem>(API_PATHS.ADMIN_LIBRARY_TAGS.UPDATE(id), payload, {
      skipGlobalErrorToast: true,
    });
  }

  async delete(ids: string[]): Promise<void> {
    return this.api.delete<void>(API_PATHS.ADMIN_LIBRARY_TAGS.DELETE, { body: { ids } });
  }
}
