import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CircularLoading } from '@/components/shared/circular-loading';
import { Dialog } from '@/components/shared/dialog';
import { Pagination } from '@/components/shared/pagination';
import { Table } from '@/components/shared/table';
import type { TableColumn } from '@/components/shared/types';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { formatLocalDate } from '@/lib/utils/display-date';
import { getRoomListTotalCount, mapRoomListApiResponse } from '@/lib/utils/room-list-mapper';
import { useRoomsStore } from '@/store/rooms-store';
import type { ChatRoom, RoomsListApiResponse } from '@/types/chat/chat-room.type';

/** 1 ページの件数（移植元 pageSize） */
const PAGE_SIZE = 10;
const EMPTY_ROOMS: ChatRoom[] = [];

interface ChatDeleteDialogProps {
  /** 閉じたとき。削除したルーム ID の配列、キャンセルは null（移植元 afterClosed の値） */
  onClose: (deletedRoomIds: string[] | null) => void;
}

/** 移植元 layouts/admin-layout/components/chat-delete-dialog と、それを開く sidebar の openDeleteDialog。チャットを選んでまとめて削除する */
export function ChatDeleteDialog({ onClose }: ChatDeleteDialogProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [selectedRooms, setSelectedRooms] = useState<ChatRoom[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 開くたび・ページを変えるたびに取り直す（移植元は毎回 API を呼ぶ）
  const { data, isPending } = useQuery({
    queryKey: ['sidebar-chat-delete-rooms', page],
    gcTime: 0,
    queryFn: async () => {
      const response = await apiClient.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, {
        params: { page: page - 1, size: PAGE_SIZE },
      });
      const existingById = new Map(useRoomsStore.getState().allRooms.map((room) => [room.id, room]));
      return {
        rooms: mapRoomListApiResponse(response, existingById),
        total: getRoomListTotalCount(response),
      };
    },
  });

  const rooms = data?.rooms ?? EMPTY_ROOMS;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const columns: TableColumn<ChatRoom>[] = [
    {
      field: 'lastMessageTime',
      header: 'SIDEBAR.DELETE_DIALOG.DATE',
      width: 'w-30',
      render: (row) => (
        <span className="text-xs text-text-muted">{formatLocalDate(row.lastMessageTime)}</span>
      ),
    },
    {
      field: 'name',
      header: 'SIDEBAR.DELETE_DIALOG.CHAT_NAME',
      render: (row) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-medium text-text-default">{row.name}</span>
          {row.lastMessage && (
            <span className="truncate text-xs text-text-muted">{row.lastMessage}</span>
          )}
        </div>
      ),
    },
  ];

  const confirmDelete = async () => {
    const ids = selectedRooms.map((room) => room.id);
    setIsDeleting(true);
    try {
      await useRoomsStore.getState().deleteRooms(ids);
      setIsConfirmOpen(false);
      onClose(ids);
    } catch (error) {
      // 失敗したら確認ダイアログを開いたままにする（エラートーストは api-client が出す）
      console.error('Delete rooms failed', error);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog
        open
        title={t('SIDEBAR.DELETE_CHAT_DIALOG_TITLE')}
        cancelText={t('COMMON.CANCEL')}
        confirmText={t('COMMON.DELETE')}
        showCancel
        showConfirm
        confirmDanger
        confirmIcon="delete"
        confirmDisabled={selectedRooms.length === 0}
        buttonAlign="right"
        dialogWidth="800px"
        contentClass="pb-0! md:pb-0! min-h-0 flex flex-col"
        onCancel={() => onClose(null)}
        onConfirm={() => setIsConfirmOpen(true)}
        onClose={() => onClose(null)}
      >
        <div className="flex h-full flex-col">
          {isPending ? (
            <div className="flex justify-center py-3">
              <CircularLoading className="[&_svg]:h-6 [&_svg]:w-6" />
            </div>
          ) : (
            <>
              <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
                <Table
                  data={rooms}
                  columns={columns}
                  selectable
                  rowTestid="chat-delete-room-row"
                  renderMobileRow={(row) => (
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs text-text-muted">
                        {formatLocalDate(row.lastMessageTime)}
                      </span>
                      <span className="truncate text-sm font-medium text-text-default">
                        {row.name}
                      </span>
                      {row.lastMessage && (
                        <span className="truncate text-xs text-text-muted">{row.lastMessage}</span>
                      )}
                    </div>
                  )}
                  onSelectionChange={setSelectedRooms}
                />
              </div>

              <div className="flex shrink-0 justify-center pt-4">
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

      <Dialog
        open={isConfirmOpen}
        title={t('SIDEBAR.DELETE_DIALOG.CONFIRM_TITLE')}
        message={t('SIDEBAR.DELETE_DIALOG.CONFIRM_DESC')}
        cancelText={t('COMMON.CANCEL')}
        confirmText={t('COMMON.DELETE')}
        showCancel
        showConfirm
        confirmDanger
        confirmIcon="delete"
        confirmLoading={isDeleting}
        buttonAlign="center"
        dialogWidth="800px"
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => void confirmDelete()}
        onClose={() => setIsConfirmOpen(false)}
      />
    </>
  );
}
