import { inject, Injectable } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { Template } from '@features/chat/components/template-selector/template-selector.component';
import { parsePromptTemplatesListResponse } from '@features/chat/utils/prompt-templates-api.mapper';

@Injectable({
  providedIn: 'root',
})
export class PromptTemplatesService {
  private readonly api = inject(ApiClientService);

  readonly promptTemplatesQuery = injectQuery(() => ({
    queryKey: ['prompt-templates'],
    queryFn: async (): Promise<Template[]> => {
      const response = await this.api.get<unknown>(API_PATHS.PROMPT_TEMPLATES.LIST, {
        params: { size: 0 },
      });
      return parsePromptTemplatesListResponse(response);
    },
  }));
}
