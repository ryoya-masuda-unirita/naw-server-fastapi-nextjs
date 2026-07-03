import { inject, Injectable, signal } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import { LibraryTag, LibraryTagsResponse } from '@app-types/chat/library-api.type';

@Injectable({ providedIn: 'root' })
export class TagsService {
  readonly tags = signal<LibraryTag[]>([]);
  readonly isLoading = signal<boolean>(false);

  private readonly api = inject(ApiClientService);

  async loadTags(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.api.get<LibraryTagsResponse>(API_PATHS.LIBRARIES.TAGS);
      this.tags.set(data.tags);
    } catch {
      this.tags.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }
}
