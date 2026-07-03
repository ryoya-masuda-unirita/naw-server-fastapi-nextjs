import { inject, Injectable, signal } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import { normalizeLibraryListResponse } from '@core/utils/library-api-normalize.util';
import { LibraryItem } from '@app-types/admin/library.types';
import { LibraryUpdateRequest, LibraryUpdateResponse } from '@app-types/chat/library-api.type';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  readonly libraryItems = signal<LibraryItem[]>([]);
  readonly isSavingToLibrary = signal<boolean>(false);
  readonly isLoadingLibrary = signal<boolean>(false);

  private readonly api = inject(ApiClientService);

  async updateLibraryMetadata(
    libraryId: string,
    body: LibraryUpdateRequest,
  ): Promise<{ id: string } | null> {
    this.isSavingToLibrary.set(true);
    try {
      const data = await this.api.put<LibraryUpdateResponse>(
        API_PATHS.LIBRARIES.UPDATE(libraryId),
        body,
      );
      return data.data;
    } catch {
      return null;
    } finally {
      this.isSavingToLibrary.set(false);
    }
  }

  async loadLibraryItems(): Promise<void> {
    this.isLoadingLibrary.set(true);
    try {
      const data = normalizeLibraryListResponse(
        await this.api.get<unknown>(API_PATHS.LIBRARY.LIST),
      );
      this.libraryItems.set(data.data);
    } catch {
      this.libraryItems.set([]);
    } finally {
      this.isLoadingLibrary.set(false);
    }
  }
}
