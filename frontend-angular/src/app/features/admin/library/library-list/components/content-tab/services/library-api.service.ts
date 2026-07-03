import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import { PagedResponse } from '@app-types/api-response.type';
import {
  LibraryListParams,
  LibraryPageItem,
  LibraryUpdatePayload,
} from '@app-types/admin/library.types';

@Injectable({ providedIn: 'root' })
export class LibraryApiService {
  private readonly api = inject(ApiClientService);
  private readonly http = inject(HttpClient);

  // tagIds は複数値を持つ可能性があるため ApiClientService.get の単一値params機構では扱えず、
  // HttpParams.append で複数クエリパラメータとして個別に組み立てる
  async list(params: LibraryListParams): Promise<PagedResponse<LibraryPageItem>> {
    let httpParams = new HttpParams()
      .set('page', String(params.page))
      .set('size', String(params.size));
    if (params.title) httpParams = httpParams.set('title', params.title);
    if (params.createdBy) httpParams = httpParams.set('createdBy', params.createdBy);
    if (params.excludeCreatedBy) {
      httpParams = httpParams.set('excludeCreatedBy', params.excludeCreatedBy);
    }
    if (params.sortBy) httpParams = httpParams.set('sortBy', params.sortBy);
    if (params.sortDir) httpParams = httpParams.set('sortDir', params.sortDir);
    for (const tagId of params.tagIds ?? []) {
      httpParams = httpParams.append('tagIds', tagId);
    }

    // バックエンドは { data: Page<LibraryPageItemResponse> } の形でラップして返す
    const res = await firstValueFrom(
      this.http.get<{ data: PagedResponse<LibraryPageItem> }>(API_PATHS.ADMIN.LIBRARY.LIST, {
        params: httpParams,
      }),
    );
    return res.data;
  }

  async update(id: string, payload: LibraryUpdatePayload): Promise<void> {
    await this.api.put(API_PATHS.ADMIN.LIBRARY.UPDATE(id), payload, {
      skipGlobalErrorToast: true,
    });
  }

  async delete(id: string): Promise<void> {
    return this.api.delete<void>(API_PATHS.ADMIN.LIBRARY.DELETE(id), {
      skipGlobalErrorToast: true,
    });
  }
}
