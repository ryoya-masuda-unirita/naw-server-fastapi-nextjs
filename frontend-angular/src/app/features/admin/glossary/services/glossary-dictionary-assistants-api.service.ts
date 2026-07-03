import { inject, Injectable } from '@angular/core';
import type { GlossaryDictionaryAssistantRow } from '@app-types/admin/glossary-dictionary.types';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';

export interface GlossaryDictionaryAssistantsListResponse {
  data: GlossaryDictionaryAssistantRow[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class GlossaryDictionaryAssistantsApiService {
  private readonly api = inject(ApiClientService);

  async list(glossaryId: string): Promise<GlossaryDictionaryAssistantsListResponse> {
    return this.api.get<GlossaryDictionaryAssistantsListResponse>(
      API_PATHS.GLOSSARY.DICTIONARY_ASSISTANTS(glossaryId),
    );
  }

  async add(
    glossaryId: string,
    assistantIds: string[],
  ): Promise<{ data: GlossaryDictionaryAssistantRow[] }> {
    return this.api.post<{ data: GlossaryDictionaryAssistantRow[] }>(
      API_PATHS.GLOSSARY.DICTIONARY_ASSISTANTS(glossaryId),
      { assistantIds },
    );
  }

  async bulkDelete(glossaryId: string, ids: string[]): Promise<void> {
    await this.api.post(API_PATHS.GLOSSARY.DICTIONARY_ASSISTANTS_BULK_DELETE(glossaryId), {
      ids,
    });
  }
}
