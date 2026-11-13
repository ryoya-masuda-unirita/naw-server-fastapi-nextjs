import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { IconButton } from '@/components/shared/icon-button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { TableList, TableListItem } from '@/components/shared/table-list';
import { ROUTES } from '@/lib/constants/routes';
import type { ChatHistoryItem } from '@/types/chat-history.types';

interface ChatHistoryListProps {
  items: ChatHistoryItem[];
}

/** 移植元 `<app-chat-history-list>`。チャット履歴の一覧テーブル */
export function ChatHistoryList({ items }: ChatHistoryListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 詳細画面（#291）が見出しを出せるよう、移植元と同じ state を渡す
  const navigateToDetail = (item: ChatHistoryItem) => {
    navigate(ROUTES.APP.ADMIN_CHAT_HISTORY_DETAIL(item.id), {
      state: { roomName: item.roomName, userName: item.userName, userId: item.userId },
    });
  };

  return (
    <TableList>
      <TableListItem
        isHeader
        className="hidden md:flex"
        actions={<span className="hidden md:inline-block _w-9 _h-9 invisible" />}
      >
        <span className="table-list-col-date table-list-label md:w-30">{t('CHAT_HISTORY.DATE')}</span>
        <span className="table-list-col-date table-list-label md:w-30">
          {t('CHAT_HISTORY.USER_NAME')}
        </span>
        <span className="table-list-col-content table-list-label">{t('CHAT_HISTORY.ROOM_NAME')}</span>
      </TableListItem>

      {items.map((item) => (
        <TableListItem
          key={item.id}
          dataTestid="admin-chat-history-list-row"
          actions={
            <IconButton
              variant="tertiary-gray"
              size="largePc"
              ariaLabel={item.roomName}
              dataTestid="admin-chat-history-detail-button"
              onClick={() => navigateToDetail(item)}
            >
              <SvgIcon name="arrowRight" className="w-5 h-5" />
            </IconButton>
          }
        >
          <div className="table-list-col-date md:w-30">
            <span className="table-list-date">{item.date}</span>
          </div>
          <div className="table-list-col-date md:w-30">
            <span className="table-list-date">{item.userName}</span>
          </div>
          <div className="table-list-col-content">
            <p className="table-list-title text-label-large md:text-label-x-large">{item.roomName}</p>
            {item.description && <p className="table-list-desc">{item.description}</p>}
          </div>
        </TableListItem>
      ))}

      {items.length === 0 && (
        <div className="px-4 py-8 text-center text-text-muted">{t('CHAT_HISTORY.NO_DATA')}</div>
      )}
    </TableList>
  );
}
