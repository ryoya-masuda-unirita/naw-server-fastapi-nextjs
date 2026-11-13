import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CircularLoading } from '@/components/shared/circular-loading';
import { Dialog } from '@/components/shared/dialog';
import { AppMatIcon } from '@/components/shared/icons/app-mat-icon';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { ROUTES } from '@/lib/constants/routes';
import { formatLocalDate } from '@/lib/utils/display-date';
import { getRoomListTotalCount, mapRoomListApiResponse } from '@/lib/utils/room-list-mapper';
import { useChatStore } from '@/store/chat-store';
import { useRoomsStore } from '@/store/rooms-store';
import type { ChatRoom, RoomsListApiResponse } from '@/types/chat/chat-room.type';

/** 検索結果の 1 ページの件数（移植元と同じ） */
const SEARCH_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

interface ChatSearchModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * サイドバーの「チャットを検索」から開くダイアログ（移植元 `openChatSearchModal` と `<app-chat-search-modal>`）。
 * 開くたびに中身をマウントし直し、検索語や結果を初期化する。
 */
export function ChatSearchModal({ open, onClose }: ChatSearchModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      title={t('CHAT.SEARCH_MODAL.TITLE')}
      cancelText={t('COMMON.CANCEL')}
      showConfirm={false}
      showCancel
      buttonAlign="center"
      dialogWidth="800px"
      onCancel={onClose}
      onClose={onClose}
    >
      <ChatSearchContent onClose={onClose} />
    </Dialog>
  );
}

function ChatSearchContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatRoom[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const totalPages = Math.max(1, Math.ceil(totalItems / SEARCH_PAGE_SIZE));
  // 入力が続いたときに、遅れて届いた前の検索の応答で結果を上書きしないための連番（移植元にはない）
  const requestSequence = useRef(0);

  const loadSearchPage = async (searchQuery: string, page: number) => {
    const sequence = ++requestSequence.current;
    setIsSearchLoading(true);
    try {
      const response = await apiClient.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, {
        params: { name: searchQuery.trim(), page: page - 1, size: SEARCH_PAGE_SIZE },
      });
      if (sequence !== requestSequence.current) return;
      const existingById = new Map(
        useRoomsStore.getState().allRooms.map((room) => [room.id, room]),
      );
      setCurrentPage(page);
      setResults(mapRoomListApiResponse(response, existingById));
      setTotalItems(getRoomListTotalCount(response));
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setResults([]);
      setTotalItems(0);
      console.error('Search rooms failed', error);
    } finally {
      if (sequence === requestSequence.current) setIsSearchLoading(false);
    }
  };

  // 検索語が確定したら 1 ページ目を読み込む。空になったら結果を初期化する
  useEffect(() => {
    if (debouncedQuery !== '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 確定した検索語に応じて API を呼ぶ副作用
      void loadSearchPage(debouncedQuery, 1);
    } else {
      requestSequence.current += 1;
      setResults([]);
      setTotalItems(0);
      setCurrentPage(1);
      setIsSearchLoading(false);
    }
  }, [debouncedQuery]);

  const handlePageChange = (page: number) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    void loadSearchPage(trimmed, page);
  };

  const openRoom = (room: ChatRoom) => {
    useChatStore.getState().selectRoom(room.id);
    onClose();
    void navigate(ROUTES.APP.CHAT_ROOM(room.id));
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder="CHAT.SEARCH_MODAL.PLACEHOLDER"
        ariaLabel="CHAT.SEARCH_MODAL.PLACEHOLDER"
        inputClass="md:w-full"
        dataTestid="chat-search-input"
      />

      {!!query && (
        <div className="flex flex-col">
          {isSearchLoading ? (
            <div className="flex justify-center py-3">
              <CircularLoading className="[&_svg]:h-6 [&_svg]:w-6" />
            </div>
          ) : (
            <>
              {results.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  data-testid="chat-search-result-item"
                  className="w-full flex items-center gap-6 py-3 px-2 text-left border-b border-border-light hover:bg-surface-light transition-colors"
                  onClick={() => openRoom(room)}
                >
                  <div className="hidden sm:block w-20 shrink-0 text-xs font-medium text-text-muted">
                    {formatLocalDate(room.lastMessageTime)}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="sm:hidden text-xs font-medium text-text-muted">
                      {formatLocalDate(room.lastMessageTime)}
                    </div>
                    <div className="text-base font-medium text-text-default truncate">{room.name}</div>
                    {room.lastMessage && (
                      <div className="text-xs text-text-muted truncate">{room.lastMessage}</div>
                    )}
                  </div>
                  <span className="shrink-0 flex items-center justify-center">
                    <AppMatIcon
                      icon="arrow_forward_ios"
                      className="text-[16px]! text-text-lighter leading-none"
                    />
                  </span>
                </button>
              ))}

              {results.length === 0 && (
                <div className="py-3 text-label text-center text-text-medium">
                  {t('CHAT.SEARCH_MODAL.EMPTY')}
                </div>
              )}

              {results.length > 0 && (
                <div className="flex shrink-0 justify-center pt-4">
                  <Pagination
                    totalPages={totalPages}
                    useQueryParams={false}
                    showPageSize={false}
                    showFirstLast={false}
                    currentPageOverride={currentPage}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
