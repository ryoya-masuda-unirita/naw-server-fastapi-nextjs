import { inject, Injectable, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { GetRoomFeedbackViewModel } from '@app-types/admin/feedback.types';
import type { RoomFeedbackRating } from '@app-types/chat/chat-room.type';
import type {
  AdditionalLearningRequest,
  AdditionalLearningResponse,
  BulkAdditionalLearningRequest,
  BulkAdditionalLearningResponse,
} from '@core/constants/mock-data/feedback.mock';

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
  readonly isAddingBulkLearning = signal<boolean>(false);

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

  async addAdditionalLearning(
    indexId: string,
    folderId: string,
  ): Promise<AdditionalLearningResponse> {
    this.isAddingLearning.set(true);
    try {
      const body: AdditionalLearningRequest = { folderId };
      return await this.api.post<AdditionalLearningResponse>(
        API_PATHS.INDEXES.ADDITIONAL_LEARNING(indexId),
        body,
      );
    } finally {
      this.isAddingLearning.set(false);
    }
  }

  async addBulkAdditionalLearning(
    ids: string[],
    folderId: string,
  ): Promise<BulkAdditionalLearningResponse> {
    this.isAddingBulkLearning.set(true);
    try {
      const body: BulkAdditionalLearningRequest = { ids, folderId };
      return await this.api.post<BulkAdditionalLearningResponse>(
        API_PATHS.INDEXES.BULK_ADDITIONAL_LEARNING,
        body,
      );
    } finally {
      this.isAddingBulkLearning.set(false);
    }
  }
}
