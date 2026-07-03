import { inject, Injectable } from '@angular/core';
import {
  AssistantApiItem,
  AssistantCategoryApiItem,
  AssistantFilter,
  AssistantMutationPayload,
} from '@app-types/admin/assistant.types';
import { GroupApiResponse } from '@app-types/admin/group-management.types';
import { PagedResponse } from '@app-types/api-response.type';
import { SelectOption } from '@app-types/common';
import { ApiClientService } from '@core/services/api-client';
import { ASSISTANT_LIST_API_PATH, ASSISTANT_SERVER_TYPE } from '../assistant-list.constants';

interface AssistantEndpointOptionResponse {
  id: string;
  endpointName: string;
  type: string;
}

interface AssistantModelResponse {
  name: string;
  endpointType: string;
  active: boolean;
}

interface AssistantIndexOptionResponse {
  id: string;
  type: string;
  name: string;
}

interface AssistantIndexListResponse {
  data: AssistantIndexOptionResponse[];
}

@Injectable({ providedIn: 'root' })
export class AssistantListApiService {
  private readonly api = inject(ApiClientService);

  // ─── Assistants ─────────────────────────────────────────────

  list(filter: AssistantFilter): Promise<PagedResponse<AssistantApiItem>> {
    const params = this.toAssistantParams(filter);
    return this.api.get<PagedResponse<AssistantApiItem>>(ASSISTANT_LIST_API_PATH.LIST, {
      params,
    });
  }

  create(data: AssistantMutationPayload): Promise<AssistantApiItem> {
    return this.api.post<AssistantApiItem>(ASSISTANT_LIST_API_PATH.LIST, data, {
      skipGlobalErrorToast: true,
    });
  }

  update(id: string, data: AssistantMutationPayload): Promise<AssistantApiItem> {
    return this.api.patch<AssistantApiItem>(`${ASSISTANT_LIST_API_PATH.LIST}/${id}`, data, {
      skipGlobalErrorToast: true,
    });
  }

  deleteOne(id: string): Promise<void> {
    return this.api.delete<void>(`${ASSISTANT_LIST_API_PATH.LIST}/${id}`, {
      skipGlobalErrorToast: true,
    });
  }

  // ─── Assistant Categories ────────────────────────────────────

  listCategories(): Promise<AssistantCategoryApiItem[]> {
    return this.api.get<AssistantCategoryApiItem[]>(ASSISTANT_LIST_API_PATH.CATEGORIES);
  }

  createCategory(data: any): Promise<AssistantCategoryApiItem> {
    return this.api.post<AssistantCategoryApiItem>(ASSISTANT_LIST_API_PATH.CATEGORIES, data, {
      skipGlobalErrorToast: true,
    });
  }

  updateCategory(id: string, data: any): Promise<AssistantCategoryApiItem> {
    return this.api.patch<AssistantCategoryApiItem>(
      `${ASSISTANT_LIST_API_PATH.CATEGORIES}/${id}`,
      data,
      { skipGlobalErrorToast: true },
    );
  }

  deleteCategory(id: string): Promise<void> {
    return this.api.delete<void>(`${ASSISTANT_LIST_API_PATH.CATEGORIES}/${id}`, {
      skipGlobalErrorToast: true,
    });
  }

  // ─── Options ────────────────────────────────────────────────

  getServerOptions(): Promise<SelectOption[]> {
    return this.api.get<SelectOption[]>(ASSISTANT_LIST_API_PATH.OPTIONS_SERVERS);
  }

  async getApiOptions(): Promise<Record<string, SelectOption[]>> {
    const endpointsByType = await this.getEndpointsByAssistantType();
    return Object.fromEntries(
      Object.entries(endpointsByType).map(([type, endpoints]) => [
        type,
        endpoints.map((endpoint) => ({
          value: endpoint.id,
          label: endpoint.endpointName,
        })),
      ]),
    );
  }

  async getModelOptions(): Promise<Record<string, Record<string, SelectOption[]>>> {
    const [endpointsByType, models] = await Promise.all([
      this.getEndpointsByAssistantType(),
      this.api.get<AssistantModelResponse[]>(ASSISTANT_LIST_API_PATH.AI_MODELS),
    ]);
    return Object.fromEntries(
      Object.entries(endpointsByType).map(([assistantType, endpoints]) => [
        assistantType,
        Object.fromEntries(
          endpoints.map((endpoint) => [
            endpoint.id,
            models
              .filter((model) => model.active && model.endpointType === endpoint.type)
              .map((model) => ({ value: model.name, label: model.name })),
          ]),
        ),
      ]),
    );
  }

  getCategoriesOptions(): Promise<SelectOption[]> {
    return this.api.get<SelectOption[]>(ASSISTANT_LIST_API_PATH.CATEGORIES_OPTIONS);
  }

  async getGroupOptions(): Promise<SelectOption[]> {
    const response = await this.api.get<GroupApiResponse>(ASSISTANT_LIST_API_PATH.OPTIONS_GROUPS);
    return response.data.map((g) => ({ value: g.id, label: g.name }));
  }

  getDictionaryOptions(): Promise<SelectOption[]> {
    return this.api.get<SelectOption[]>(ASSISTANT_LIST_API_PATH.OPTIONS_DICTIONARIES);
  }

  async getFolderOptions(): Promise<SelectOption[]> {
    const response = await this.api.get<
      | AssistantIndexOptionResponse[]
      | AssistantIndexListResponse
      | { content: AssistantIndexOptionResponse[] }
    >(ASSISTANT_LIST_API_PATH.INDEXES, {
      params: { size: '1000' },
    });
    let indexes: AssistantIndexOptionResponse[];
    if (Array.isArray(response)) {
      indexes = response;
    } else if ('content' in response && Array.isArray(response.content)) {
      indexes = response.content;
    } else {
      indexes = (response as AssistantIndexListResponse).data ?? [];
    }
    return indexes
      .filter((index) => index.type === 'SAAS_GLOBAL')
      .map((index) => ({ value: index.id, label: index.name }));
  }

  // ─── Param Helpers ───────────────────────────────────────────

  private toAssistantParams(filter: AssistantFilter): Record<string, string> {
    const params: Record<string, string> = {
      page: String(Math.max(0, filter.pageIndex)),
      size: String(filter.pageSize),
    };
    if (filter.sortField) {
      params['sort'] = `${filter.sortField},${filter.sortOrder ?? 'desc'}`;
    }
    if (filter.filterServer) {
      params['type'] = filter.filterServer;
    }
    if (filter.filterCategory) {
      params['categoryId'] = filter.filterCategory;
    }
    if (filter.filterTeam) {
      params['groupId'] = filter.filterTeam;
    }
    const search = filter.search?.trim() || filter.query?.trim();
    if (search) {
      params['search'] = search;
    }
    if (filter.excludeGroupId) {
      params['excludeGroupId'] = filter.excludeGroupId;
    }
    return params;
  }

  private async getEndpointsByAssistantType(): Promise<
    Record<string, AssistantEndpointOptionResponse[]>
  > {
    const assistantTypes = [
      ASSISTANT_SERVER_TYPE.SECURE,
      ASSISTANT_SERVER_TYPE.SAAS_CHAT,
      ASSISTANT_SERVER_TYPE.SAAS_RAG,
    ];
    const entries = await Promise.all(
      assistantTypes.map(async (type) => [
        type,
        await this.api.get<AssistantEndpointOptionResponse[]>(
          ASSISTANT_LIST_API_PATH.ENDPOINTS_BY_TYPE(type),
        ),
      ]),
    );
    return Object.fromEntries(entries);
  }
}
