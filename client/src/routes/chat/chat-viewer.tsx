import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChatSummary } from '@/components/features/chat/chat-summary';
import { useViewerStore } from '@/store/viewer-store';

/**
 * `/chat/viewer/:chatId`（移植元 features/chat/pages/chat-viewer）。ビューワーだけを別タブで開く画面。
 * `?libraryId=` があればそのライブラリを選んで表示する。
 */
export function ChatViewerPage() {
  const { chatId = null } = useParams<{ chatId: string }>();
  const [searchParams] = useSearchParams();
  const libraryId = searchParams.get('libraryId');
  const viewers = useViewerStore((s) => s.viewers);

  useEffect(() => {
    void (async () => {
      await useViewerStore.getState().loadList(chatId ?? '', libraryId ? { autoSelect: false } : {});
      if (!libraryId) return;

      const item = useViewerStore.getState().viewers.find((v) => v.id === libraryId);
      if (item) {
        useViewerStore.getState().selectLibrary(item);
        return;
      }
      await useViewerStore.getState().showLibrary({ id: libraryId, title: '' });
    })();
  }, [chatId, libraryId]);

  return (
    <div className="flex h-screen w-full bg-white">
      <ChatSummary chatId={chatId} isDetailPage headerOptions={viewers} />
    </div>
  );
}
