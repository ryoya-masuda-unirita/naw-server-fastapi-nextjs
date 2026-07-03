import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  TrainingDataApiItem,
  TrainingDataApiResponse,
  TrainingDataFile,
  TrainingDataFileApiResponse,
  TrainingDataFileFilter,
  TrainingDataFilter,
  TrainingFileUploadEntry,
} from '@app-types/training-data.types';
import {
  TRAINING_DATA_API_PATH,
  TRAINING_FOLDER_GROUP_PAGE_SIZE,
} from '../training-data.constants';
import { toSplitLength } from '../utils/training-data-chunk-size.helper';
import { toFileListApiParams } from '../utils/training-data-files.helper';
import {
  LOCAL_FOLDER_ENDPOINT_TYPE,
  normalizeTenantEndpointsResponse,
  type TenantEndpointOption,
} from '../utils/training-folder-form.helper';
import {
  normalizeTrainingDataFileBody,
  normalizeTrainingDataFileListBody,
  normalizeTrainingDataIndexBody,
  normalizeTrainingDataListBody,
} from '../utils/training-api-normalize';

/** Backend `IndexCreateRequest` / `Index` write body. */
export interface CreateIndexPayload {
  name: string;
  type: 'SAAS_GLOBAL' | 'LOCAL';
  description?: string;
  add?: string;
  delete?: string;
  get?: string;
  endpointIds?: string[];
  groupIds?: string[];
}

export type UpdateIndexPayload = Partial<CreateIndexPayload>;

export interface UpdateFileDto {
  name?: string;
  displayName?: string;
  reference?: string;
  splitLength?: string;
  status?: TrainingDataFile['status'];
}

@Injectable({ providedIn: 'root' })
export class TrainingApiService {
  private readonly http = inject(HttpClient);

  async list(filter: TrainingDataFilter): Promise<TrainingDataApiResponse> {
    const raw = await firstValueFrom(
      this.http.get<unknown>(TRAINING_DATA_API_PATH.LIST, {
        params: this.buildHttpParams(filter),
      }),
    );
    return normalizeTrainingDataListBody(raw, filter);
  }

  async listFiles(
    indexId: string,
    filter: TrainingDataFileFilter,
    currentUserId?: string,
  ): Promise<TrainingDataFileApiResponse> {
    const raw = await firstValueFrom(
      this.http.get<unknown>(TRAINING_DATA_API_PATH.FILES(indexId), {
        params: this.buildFileListParams(filter, currentUserId),
      }),
    );
    return normalizeTrainingDataFileListBody(raw, filter);
  }

  async create(data: Partial<TrainingDataApiItem>): Promise<TrainingDataApiItem> {
    const raw = await firstValueFrom(
      this.http.post<unknown>(TRAINING_DATA_API_PATH.LIST, this.toWritePayload(data)),
    );
    return normalizeTrainingDataIndexBody(raw);
  }

  async getById(id: string): Promise<TrainingDataApiItem> {
    const raw = await firstValueFrom(this.http.get<unknown>(TRAINING_DATA_API_PATH.DETAIL(id)));
    return normalizeTrainingDataIndexBody(raw);
  }

  async syncFolder(id: string): Promise<void> {
    await firstValueFrom(this.http.post<unknown>(TRAINING_DATA_API_PATH.SYNC(id), {}));
  }

  async uploadFile(indexId: string, file: File, dto: UpdateFileDto): Promise<TrainingDataFile> {
    const formData = new FormData();
    formData.append('file', file);
    const raw = await firstValueFrom(
      this.http.post<unknown>(TRAINING_DATA_API_PATH.FILES(indexId), formData, {
        params: this.buildFileDtoParams(dto),
      }),
    );
    return normalizeTrainingDataFileBody(raw);
  }

  async addFiles(indexId: string, entries: TrainingFileUploadEntry[]): Promise<void> {
    for (const entry of entries) {
      const file =
        entry.file ??
        new File([], entry.name ?? entry.displayName, {
          type: 'application/octet-stream',
        });
      await this.uploadFile(indexId, file, {
        displayName: entry.displayName,
        name: entry.linkName ?? entry.name ?? file.name,
        splitLength: entry.chunkSize,
        reference: entry.reference,
      });
    }
  }

  async deleteFile(indexId: string, fileId: string): Promise<void> {
    await firstValueFrom(this.http.delete<unknown>(TRAINING_DATA_API_PATH.FILE(indexId, fileId)));
  }

  async deleteFiles(indexId: string, fileIds: string[]): Promise<void> {
    await Promise.all(fileIds.map((fileId) => this.deleteFile(indexId, fileId)));
  }

  async deleteFolder(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<unknown>(TRAINING_DATA_API_PATH.DETAIL(id)));
  }

  async updateFolder(id: string, data: Partial<TrainingDataApiItem>): Promise<void> {
    await firstValueFrom(
      this.http.patch<unknown>(TRAINING_DATA_API_PATH.DETAIL(id), this.toWritePayload(data)),
    );
  }

  async updateFile(
    indexId: string,
    fileId: string,
    dto: UpdateFileDto,
    file?: File,
  ): Promise<TrainingDataFile> {
    const options = { params: this.buildFileDtoParams(dto) };
    const raw = file
      ? await firstValueFrom(
          this.http.patch<unknown>(
            TRAINING_DATA_API_PATH.FILE(indexId, fileId),
            (() => {
              const formData = new FormData();
              formData.append('file', file);
              return formData;
            })(),
            options,
          ),
        )
      : await firstValueFrom(
          this.http.patch<unknown>(TRAINING_DATA_API_PATH.FILE(indexId, fileId), null, options),
        );
    return normalizeTrainingDataFileBody(raw);
  }

  async downloadFile(indexId: string, fileId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(TRAINING_DATA_API_PATH.FILE(indexId, fileId), {
        responseType: 'blob',
      }),
    );
  }

  async listEndpointsByType(type: string): Promise<TenantEndpointOption[]> {
    const raw = await firstValueFrom(
      this.http.get<unknown>(TRAINING_DATA_API_PATH.ENDPOINTS_BY_TYPE(type)),
    );
    return normalizeTenantEndpointsResponse(raw);
  }

  async listLocalEndpoints(): Promise<TenantEndpointOption[]> {
    return this.listEndpointsByType(LOCAL_FOLDER_ENDPOINT_TYPE);
  }

  async listAllGroupIds(): Promise<string[]> {
    const ids: string[] = [];
    let pageIndex = 1;
    let total = 0;

    do {
      const raw = await firstValueFrom(
        this.http.get<unknown>(TRAINING_DATA_API_PATH.GROUPS, {
          params: {
            page: String(pageIndex - 1),
            size: String(TRAINING_FOLDER_GROUP_PAGE_SIZE),
          },
        }),
      );
      const page = this.normalizeGroupListPage(raw);
      ids.push(...page.ids);
      total = page.total;
      pageIndex += 1;
    } while (ids.length < total);

    return ids;
  }

  private normalizeGroupListPage(raw: unknown): { ids: string[]; total: number } {
    if (raw && typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      if (Array.isArray(record['content'])) {
        const content = record['content'] as Array<Record<string, unknown>>;
        return {
          ids: content.map((row) => String(row['id'] ?? '').trim()).filter(Boolean),
          total: Number(record['totalElements'] ?? content.length),
        };
      }
      if (Array.isArray(record['data'])) {
        const data = record['data'] as Array<Record<string, unknown>>;
        return {
          ids: data.map((row) => String(row['id'] ?? '').trim()).filter(Boolean),
          total: Number(record['total'] ?? data.length),
        };
      }
    }
    return { ids: [], total: 0 };
  }

  private buildHttpParams(filter: TrainingDataFilter): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(this.toListParams(filter))) {
      if (value !== undefined) {
        params = params.set(key, String(value));
      }
    }
    return params;
  }

  private buildFileListParams(filter: TrainingDataFileFilter, currentUserId?: string): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(toFileListApiParams(filter, currentUserId))) {
      if (value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return params;
  }

  private buildFileDtoParams(dto: UpdateFileDto): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined || value === '') continue;

      const paramValue = key === 'splitLength' ? toSplitLength(String(value)) : String(value);

      if (paramValue !== undefined) {
        params = params.set(key, paramValue);
      }
    }
    return params;
  }

  private toListParams(filter: TrainingDataFilter): Record<string, string | number | undefined> {
    const sort = filter.sortField ? `${filter.sortField},${filter.sortOrder || 'desc'}` : undefined;
    return {
      page: Math.max(0, filter.pageIndex - 1),
      size: filter.pageSize,
      searchText: filter.query?.trim() ?? '',
      sort,
    };
  }

  private toWritePayload(data: Partial<TrainingDataApiItem>): UpdateIndexPayload {
    return {
      name: data.name,
      type: data.type,
      description: data.description,
      add: data.add,
      delete: data.delete,
      get: data.get,
      endpointIds: data.endpointIds,
      groupIds: data.groupIds,
    };
  }
}
