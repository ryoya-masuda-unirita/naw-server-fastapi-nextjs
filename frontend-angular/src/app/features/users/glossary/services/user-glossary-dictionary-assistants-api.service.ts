import { inject, Injectable } from '@angular/core';
import type { GlossaryDictionaryAssistantRow } from '@app-types/admin/glossary-dictionary.types';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';

export interface UserGlossaryDictionaryAssistantsListResponse {
  data: GlossaryDictionaryAssistantRow[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class UserGlossaryDictionaryAssistantsApiService {
  private readonly api = inject(ApiClientService);

  async list(glossaryId: string): Promise<UserGlossaryDictionaryAssistantsListResponse> {
    return this.api.get<UserGlossaryDictionaryAssistantsListResponse>(
      API_PATHS.USER_GLOSSARY.DICTIONARY_ASSISTANTS(glossaryId),
    );
  }
}
