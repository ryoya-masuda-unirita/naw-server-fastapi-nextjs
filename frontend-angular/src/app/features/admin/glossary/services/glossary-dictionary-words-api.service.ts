import { inject, Injectable } from '@angular/core';
import type { GlossaryWordTableRow } from '@app-types/admin/glossary-dictionary.types';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';

export interface GlossaryDictionaryWordsListResponse {
  data: GlossaryWordTableRow[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class GlossaryDictionaryWordsApiService {
  private readonly api = inject(ApiClientService);

  async list(glossaryId: string): Promise<GlossaryDictionaryWordsListResponse> {
    return this.api.get<GlossaryDictionaryWordsListResponse>(
      API_PATHS.GLOSSARY.DICTIONARY_WORDS(glossaryId),
    );
  }

  async update(
    glossaryId: string,
    wordId: string,
    input: { name: string; description: string; tags?: string[] },
  ): Promise<{ data: GlossaryWordTableRow }> {
    return this.api.patch<{ data: GlossaryWordTableRow }>(
      API_PATHS.GLOSSARY.DICTIONARY_WORD(glossaryId, wordId),
      input,
    );
  }

  async delete(glossaryId: string, wordId: string): Promise<void> {
    await this.api.delete(API_PATHS.GLOSSARY.DICTIONARY_WORD(glossaryId, wordId));
  }

  async bulkDelete(glossaryId: string, ids: string[]): Promise<void> {
    await this.api.post(API_PATHS.GLOSSARY.DICTIONARY_WORDS_BULK_DELETE(glossaryId), { ids });
  }
}
