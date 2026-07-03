import { inject, Injectable } from '@angular/core';
import type { GlossaryWordTableRow } from '@app-types/admin/glossary-dictionary.types';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';

export interface UserGlossaryDictionaryWordsListResponse {
  data: GlossaryWordTableRow[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class UserGlossaryDictionaryWordsApiService {
  private readonly api = inject(ApiClientService);

  async list(glossaryId: string): Promise<UserGlossaryDictionaryWordsListResponse> {
    return this.api.get<UserGlossaryDictionaryWordsListResponse>(
      API_PATHS.USER_GLOSSARY.DICTIONARY_WORDS(glossaryId),
    );
  }
}
