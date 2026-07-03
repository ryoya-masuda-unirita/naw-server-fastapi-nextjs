import { inject, Injectable, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { GetMessageFeedbackViewModel } from '@app-types/admin/feedback.types';
import type {
  AdditionalLearningRequest,
  AdditionalLearningResponse,
  BulkAdditionalLearningRequest,
  BulkAdditionalLearningResponse,
  LearningFolderItem,
  LearningFoldersResponse,
} from '@core/constants/mock-data/feedback.mock';

@Injectable({ providedIn: 'root' })
export class FeedbackMessageApiService {
  private readonly api = inject(ApiClientService);

  fetchAccuracyFeedback(params: {
    assistantId?: string;
    rating?: string;
    folderId?: string;
    page?: number;
    size?: number;
    sortField?: string;
    sortOrder?: string;
  }): Promise<GetMessageFeedbackViewModel> {
    return this.api.get<GetMessageFeedbackViewModel>(API_PATHS.ADMIN.FEEDBACK_MESSAGES.LIST, {
      params,
    });
  }

  // /admin/learning-folders はバックエンドに存在しないため、/admin/indexes を代わりに使用する
  readonly learningFoldersQuery = injectQuery(() => ({
    queryKey: ['admin', 'learning-folders'],
    queryFn: async (): Promise<LearningFoldersResponse> => {
      const res = await this.api.get<
        { id: string; name: string }[] | { content: { id: string; name: string }[] }
      >(API_PATHS.INDEXES.LIST);
      const items = Array.isArray(res) ? res : (res.content ?? []);
      const data: LearningFolderItem[] = items.map((item) => ({
        id: item.id,
        name: item.name,
        description: '',
        category: '',
      }));
      return { data };
    },
  }));

  readonly isAddingLearning = signal<boolean>(false);
  readonly isAddingBulkLearning = signal<boolean>(false);

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
