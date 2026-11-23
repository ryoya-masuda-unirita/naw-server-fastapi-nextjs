import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';

export interface Team {
  id: string;
  name: string;
}

interface GroupListApiItem {
  id: string;
  name: string;
}

type GroupListApiResponse = GroupListApiItem[] | { data: GroupListApiItem[]; total?: number };

interface TeamsState {
  teams: Team[];
  isLoading: boolean;
  loadTeams: () => Promise<void>;
}

function toTeams(response: GroupListApiResponse): Team[] {
  const items = Array.isArray(response) ? response : (response.data ?? []);
  return items.map(({ id, name }) => ({ id, name }));
}

/** 移植元 TeamsService。共有先に選べるチーム（グループ）の一覧。失敗したら空にする */
export const useTeamsStore = create<TeamsState>((set) => ({
  teams: [],
  isLoading: false,
  loadTeams: async () => {
    set({ isLoading: true });
    try {
      const response = await apiClient.get<GroupListApiResponse>(API_PATHS.GROUPS.LIST);
      set({ teams: toTeams(response) });
    } catch (error) {
      console.error('Load teams failed', error);
      set({ teams: [] });
    } finally {
      set({ isLoading: false });
    }
  },
}));
