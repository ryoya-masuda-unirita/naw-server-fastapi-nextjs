import { inject, Injectable } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { ApiClientService } from '@core/services/api-client';
import { Assistant } from '@app/core/constants/mock-data/assistants.mock';
import { API_PATHS } from '@core/constants/api-paths.config';
import { parseAssistantsListResponse } from '@features/chat/utils/assistants-api.mapper';

@Injectable({
  providedIn: 'root',
})
export class AssistantsService {
  private readonly api = inject(ApiClientService);

  readonly assistantsQuery = injectQuery(() => ({
    queryKey: ['assistants'],
    queryFn: async (): Promise<Assistant[]> => {
      const response = await this.api.get<unknown>(API_PATHS.ASSISTANTS.LIST);
      return parseAssistantsListResponse(response);
    },
  }));
}
