import { inject, Injectable } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';

/** Slim Group shape returned by `GET /api/admin/groups` (only what the form combobox needs). */
export interface GroupOption {
  id: string;
  name: string;
}

interface GroupListPageResponse {
  data: GroupOption[];
}

@Injectable({ providedIn: 'root' })
export class GroupsApiService {
  private readonly api = inject(ApiClientService);

  async list(): Promise<GroupOption[]> {
    const res = await this.api.get<GroupListPageResponse>('/admin/groups', {
      params: { size: 1000 },
    });
    return res.data ?? [];
  }
}
