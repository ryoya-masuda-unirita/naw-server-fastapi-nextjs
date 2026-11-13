import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { LibraryUpdateRequest, LibraryUpdateResponse } from '@/types/chat/library-api.type';

/**
 * ビューワーの「ライブラリに保存」（移植元 `LibraryService.updateLibraryMetadata`）。
 * 失敗の共通エラートーストは api-client が出す。
 * `mutateAsync` は失敗時に例外を投げるので、移植元と同じ「失敗なら null」は `saveLibraryMetadata` で返す。
 */
export function useLibraryMetadataSave() {
  const mutation = useMutation({
    mutationFn: ({ libraryId, body }: { libraryId: string; body: LibraryUpdateRequest }) =>
      apiClient.put<LibraryUpdateResponse>(API_PATHS.LIBRARIES.UPDATE(libraryId), body),
  });

  const saveLibraryMetadata = async (
    libraryId: string,
    body: LibraryUpdateRequest,
  ): Promise<{ id: string } | null> => {
    try {
      const response = await mutation.mutateAsync({ libraryId, body });
      return response.data;
    } catch {
      // トーストは api-client が出している。呼び出し側は null で失敗を知る
      return null;
    }
  };

  return { saveLibraryMetadata, isSaving: mutation.isPending };
}
