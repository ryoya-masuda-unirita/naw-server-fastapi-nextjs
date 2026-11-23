import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@/components/shared/dialog';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { Pagination } from '@/components/shared/pagination';
import { Skeleton, SkeletonBlock } from '@/components/shared/skeleton';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { getRoomListTotalCount, mapRoomListApiResponse } from '@/lib/utils/room-list-mapper';
import { useRoomsStore } from '@/store/rooms-store';
import type { RoomPinUpdate, RoomsListApiResponse } from '@/types/chat/chat-room.type';

/** 固定したチャットを 1 回に取る件数（移植元 pinnedRoomsPageSize） */
const PINNED_ROOMS_PAGE_SIZE = 1000;
/** 固定していないチャットの 1 ページの件数（移植元 pageSize） */
const PAGE_SIZE = 10;

interface SortableRoom {
  id: string;
  title: string;
  isPinned: boolean;
}

interface ChatSortDialogProps {
  /** 閉じたとき。保存したときは送った更新の配列、キャンセルは false（移植元 afterClosed の値） */
  onClose: (result: RoomPinUpdate[] | false) => void;
}

/** 取得した一覧に、未保存のピン変更を重ねる（移植元 applyPendingPinStates） */
function applyPendingPinStates(
  rooms: SortableRoom[],
  pending: SortableRoom[],
  targetIsPinned: boolean,
): SortableRoom[] {
  const pendingById = new Map(pending.map((room) => [room.id, room]));
  const roomIds = new Set(rooms.map((room) => room.id));
  const visibleRooms = rooms
    .map((room) => ({ ...room, isPinned: pendingById.get(room.id)?.isPinned ?? room.isPinned }))
    .filter((room) => room.isPinned === targetIsPinned);

  // 別のページから動かしてきた分（取得した一覧にない）も出す
  for (const room of pending) {
    if (room.isPinned === targetIsPinned && !roomIds.has(room.id)) {
      visibleRooms.push(room);
    }
  }
  return visibleRooms;
}

async function fetchRooms(isPinned: boolean, page: number, size: number) {
  const response = await apiClient.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, {
    params: { isPinned, page, size },
  });
  return {
    rooms: mapRoomListApiResponse(response).map<SortableRoom>((room) => ({
      id: room.id,
      title: room.name,
      isPinned,
    })),
    total: getRoomListTotalCount(response),
  };
}

/**
 * 移植元 layouts/admin-layout/components/chat-sort-dialog と、それを開く sidebar の openSortDialog。
 * 固定するチャットを選び直して保存する（保存は `PUT /api/rooms/pin`。移植元の server にも無い API）。
 */
export function ChatSortDialog({ onClose }: ChatSortDialogProps) {
  const { t } = useTranslation();
  const isReorderingRooms = useRoomsStore((s) => s.isReorderingRooms);
  const [page, setPage] = useState(1);
  // 未保存のピン変更。isPinned は変更後の状態。もとの状態に戻したものは持たない
  const [pending, setPending] = useState<SortableRoom[]>([]);

  const pinnedQuery = useQuery({
    queryKey: ['sidebar-chat-sort-pinned'],
    gcTime: 0,
    queryFn: () => fetchRooms(true, 0, PINNED_ROOMS_PAGE_SIZE),
  });
  const unpinnedQuery = useQuery({
    queryKey: ['sidebar-chat-sort-unpinned', page],
    gcTime: 0,
    queryFn: () => fetchRooms(false, page - 1, PAGE_SIZE),
  });

  const isSearchLoading = pinnedQuery.isPending || unpinnedQuery.isPending;
  const pinnedRooms = applyPendingPinStates(pinnedQuery.data?.rooms ?? [], pending, true);
  const unpinnedRooms = applyPendingPinStates(unpinnedQuery.data?.rooms ?? [], pending, false);
  const totalPages = Math.max(1, Math.ceil((unpinnedQuery.data?.total ?? 0) / PAGE_SIZE));

  const togglePin = (room: SortableRoom) => {
    const nextIsPinned = !room.isPinned;
    const existing = pending.find((item) => item.id === room.id);
    // 未保存の変更があるなら、その前の状態がもとの状態
    const initialIsPinned = existing ? !existing.isPinned : room.isPinned;

    if (initialIsPinned === nextIsPinned) {
      setPending(pending.filter((item) => item.id !== room.id));
    } else if (existing) {
      setPending(pending.map((item) => (item.id === room.id ? { ...room, isPinned: nextIsPinned } : item)));
    } else {
      setPending([...pending, { ...room, isPinned: nextIsPinned }]);
    }
  };

  const save = async () => {
    const payload: RoomPinUpdate[] = pending.map((room) => ({
      roomId: room.id,
      isPinned: room.isPinned,
    }));
    try {
      await useRoomsStore.getState().bulkUpdateRoomPins(payload);
      onClose(payload);
    } catch (error) {
      // 失敗したらダイアログを開いたままにする（エラートーストは api-client が出す）
      console.error('Bulk update room pins failed', error);
    }
  };

  const renderRow = (room: SortableRoom, iconName: 'push_pin' | 'unpin', buttonClass: string) => (
    <div
      key={room.id}
      className="flex cursor-grab items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:bg-gray-50 active:cursor-grabbing"
    >
      <SvgIcon name="dragIndicator" className="h-5 w-5 cursor-grab" />
      <span className="flex-1 truncate text-sm text-gray-800">{room.title}</span>
      <button
        type="button"
        aria-label={`toggle-pin-${room.id}`}
        className={`flex h-5 w-5 items-center justify-center transition-colors ${buttonClass}`}
        onClick={() => togglePin(room)}
      >
        <SvgIcon name={iconName} className="h-5 w-5 cursor-grab" />
      </button>
    </div>
  );

  return (
    <Dialog
      open
      title={t('SIDEBAR.SORT_CHAT_DIALOG_TITLE')}
      cancelText={t('SIDEBAR.CANCEL')}
      confirmText={t('SIDEBAR.SAVE')}
      showCancel
      showConfirm
      confirmLoading={isReorderingRooms}
      buttonAlign="right"
      dialogWidth="800px"
      panelClass="max-h-[calc(100vh-80px)]"
      contentClass="overflow-hidden! min-h-0 flex flex-col"
      onCancel={() => onClose(false)}
      onConfirm={() => void save()}
      onClose={() => onClose(false)}
    >
      <div className="flex h-full max-h-[calc(100vh-380px)] min-h-0 flex-col gap-6">
        {isSearchLoading ? (
          <>
            <section>
              <Skeleton variant="text" width="6rem" height="1rem" className="mb-2" />
              <SkeletonBlock length={2} />
            </section>
            <section>
              <Skeleton variant="text" width="6rem" height="1rem" className="mb-2" />
              <SkeletonBlock length={3} />
            </section>
          </>
        ) : (
          <>
            <section className="max-h-40 shrink-0 overflow-hidden">
              <h3 className="mb-2 text-sm font-semibold text-gray-500">
                {t('SIDEBAR.PINNED_CHATS')}
              </h3>
              <div className="flex max-h-28 flex-col gap-0 overflow-y-auto">
                {pinnedRooms.map((room) => renderRow(room, 'push_pin', 'text-text-weak'))}
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <h3 className="mb-2 text-sm font-semibold text-gray-500">
                {t('SIDEBAR.UNPINNED_CHATS')}
              </h3>
              <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
                {unpinnedRooms.map((room) => renderRow(room, 'unpin', 'text-text-weak'))}
              </div>
            </section>

            <div className="flex shrink-0 justify-center">
              <Pagination
                totalPages={totalPages}
                useQueryParams={false}
                showPageSize={false}
                showFirstLast={false}
                currentPageOverride={page}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
