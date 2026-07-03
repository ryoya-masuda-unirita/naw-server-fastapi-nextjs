import { inject, Injectable, signal } from '@angular/core';
import { Team } from '@core/constants/mock-data/teams.mock';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';

interface GroupListApiItem {
  id: string;
  name: string;
}

type GroupListApiResponse = GroupListApiItem[] | { data: GroupListApiItem[]; total?: number };

function toTeams(response: GroupListApiResponse): Team[] {
  const items = Array.isArray(response) ? response : (response.data ?? []);
  return items.map(({ id, name }) => ({ id, name }));
}

@Injectable({
  providedIn: 'root',
})
export class TeamsService {
  readonly teams = signal<Team[]>([]);
  readonly isLoading = signal<boolean>(false);

  private readonly api = inject(ApiClientService);

  async loadTeams(): Promise<void> {
    this.isLoading.set(true);
    try {
      const response = await this.api.get<GroupListApiResponse>(API_PATHS.GROUPS.LIST);
      this.teams.set(toTeams(response));
    } catch {
      this.teams.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }
}
