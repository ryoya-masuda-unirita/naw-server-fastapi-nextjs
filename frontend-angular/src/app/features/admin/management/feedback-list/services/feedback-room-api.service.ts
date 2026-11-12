import { inject, Injectable, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { GetRoomFeedbackViewModel } from '@app-types/admin/feedback.types';
import type { RoomFeedbackRating } from '@app-types/chat/chat-room.type';

export type FeedbackRoomQueryParams = Record<string, string | number | undefined> & {
  assistantId?: string;
  rating?: RoomFeedbackRating | 'UNRATED';
  folderId?: string;
  page?: number;
  size?: number;
  sortField?: string;
  sortOrder?: string;
};

@Injectable({ providedIn: 'root' })
export class FeedbackRoomService {
  private readonly api = inject(ApiClientService);

  readonly isAddingLearning = signal<boolean>(false);

  fetchRoomFeedback(params: FeedbackRoomQueryParams): Promise<GetRoomFeedbackViewModel> {
    return this.api.get<GetRoomFeedbackViewModel>(API_PATHS.ADMIN.FEEDBACK_ROOMS.LIST, {
      params,
    });
  }

  createRoomFeedbackQuery(paramsFn: () => FeedbackRoomQueryParams) {
    return injectQuery(() => {
      const params = paramsFn();
      return {
        queryKey: ['feedback', 'satisfaction', params] as const,
        queryFn: (): Promise<GetRoomFeedbackViewModel> => this.fetchRoomFeedback(params),
      };
    });
  }

  async addAdditionalLearning(indexId: string, roomId: string, content: File): Promise<void> {
    this.isAddingLearning.set(true);
    try {
      const body = new FormData();
      body.append('roomId', roomId);
      body.append('content', content);
      await this.api.post<void>(API_PATHS.INDEXES.ADDITIONAL_LEARNING(indexId), body);
    } finally {
      this.isAddingLearning.set(false);
    }
  }
}
