import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChatSummary } from '@/components/features/chat/chat-summary';
import { useViewerStore } from '@/store/viewer-store';
import type { ViewerListItem } from '@/types/chat/viewer.type';

/** `/library/:id`（移植元 features/admin/library/library-detail）。1 件のライブラリを Markdown ビューワーで表示する */
export function LibraryDetailPage() {
  const { id: libraryId = null } = useParams<{ id: string }>();
  // 単一ライブラリ表示のため、ヘッダーの選択肢は対象ライブラリ 1 件のみ
  const [headerOptions, setHeaderOptions] = useState<ViewerListItem[]>([]);

  useEffect(() => {
    if (!libraryId) return;
    let cancelled = false;
    void useViewerStore
      .getState()
      .showLibrary({ id: libraryId, title: '' })
      .then(() => {
        if (cancelled) return;
        const active = useViewerStore.getState().activeLibrary;
        setHeaderOptions(active ? [active] : [{ id: libraryId, title: '' }]);
      });
    return () => {
      cancelled = true;
    };
  }, [libraryId]);

  return (
    <div className="w-full h-screen min-w-0 flex flex-col flex-1 rounded-t-2xl md:rounded-bl-2xl md:rounded-tr-none shadow-overlay md:shadow-viewer overflow-hidden md:border-t md:border-l md:border-b md:border-border-weak">
      <div className="flex h-screen w-full bg-white">
        <ChatSummary chatId={libraryId} isDetailPage headerOptions={headerOptions} />
      </div>
    </div>
  );
}
