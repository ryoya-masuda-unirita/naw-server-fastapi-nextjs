import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ComboboxMulti } from '@/components/shared/combobox-multi';
import { Dialog } from '@/components/shared/dialog';
import { buildShareUrl } from '@/lib/utils/share-url';
import { useActiveRoom } from '@/store/chat-store';
import { useSharesStore } from '@/store/shares-store';
import { useTeamsStore } from '@/store/teams-store';

interface ChatShareDialogProps {
  /** 共有ルームを開いた側など、共有を変更できないとき */
  isReadOnly: boolean;
  onClose: () => void;
}

/** 移植元 `ChatWindowComponent.openShareDialog` と `<app-chat-share-dialog>`。ルームを共有するチームを選ぶ */
export function ChatShareDialog({ isReadOnly, onClose }: ChatShareDialogProps) {
  const { t } = useTranslation();
  const room = useActiveRoom();
  const teams = useTeamsStore((s) => s.teams);
  const isSharing = useSharesStore((s) => s.isSharing);
  const isUnsharing = useSharesStore((s) => s.isUnsharing);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(room?.teamIds ?? []);
  const [syncedRoom, setSyncedRoom] = useState(room);
  const [isUnshareConfirmOpen, setIsUnshareConfirmOpen] = useState(false);

  // ルームが入れ替わったら（共有・解除でも入れ替わる）、選択をそのルームの共有先へ戻す（移植元の effect）
  if (room !== syncedRoom) {
    setSyncedRoom(room);
    setSelectedTeamIds(room?.teamIds ?? []);
  }

  useEffect(() => {
    void useTeamsStore.getState().loadTeams();
  }, []);

  const roomId = room?.id ?? '';
  const roomShareId = room?.shareId ?? null;
  const showShareLinkActions = !!roomShareId && !isReadOnly;
  const teamsOptions = useMemo(
    () => teams.map((team) => ({ value: team.id, label: team.name })),
    [teams],
  );

  const handleShare = () => {
    useSharesStore
      .getState()
      .shareRoom(roomId, selectedTeamIds)
      .catch((error: unknown) => {
        console.error('Share room failed', error);
        onClose();
      });
  };

  const handleCopyShareLink = () => {
    if (!roomShareId) return;
    void navigator.clipboard.writeText(buildShareUrl(roomShareId));
  };

  const handleUnshare = () => {
    if (!roomShareId) {
      onClose();
      return;
    }
    useSharesStore
      .getState()
      .unshareRoom(roomShareId)
      .catch((error: unknown) => {
        console.error('Unshare room failed', error);
      })
      .finally(onClose);
  };

  return (
    <>
      <Dialog
        open
        title={t('CHAT.SHARE_DIALOG.TITLE')}
        showClose={false}
        showCancel
        showConfirm={!isReadOnly}
        buttonAlign="right"
        cancelText={t('CHAT.SHARE_DIALOG.CANCEL')}
        confirmText={t('CHAT.SHARE_DIALOG.SHARE_ACTION')}
        confirmMinWidth="min-w-24.5"
        confirmLoading={isSharing}
        confirmDisabled={selectedTeamIds.length === 0}
        dialogWidth="800px"
        autoFocus={false}
        panelClass="share-dialog-container dialog-overflow-visible"
        onCancel={onClose}
        onConfirm={handleShare}
        onClose={onClose}
      >
        <div className="flex flex-col">
          <div className="mb-3">
            <h3 className="mb-1 text-sm font-medium text-text-default">
              {t('CHAT.SHARE_DIALOG.SHARE_TEAMS')}
            </h3>
          </div>

          <ComboboxMulti
            id="share-teams"
            name="share-teams"
            options={teamsOptions}
            placeholder={t('CHAT.SHARE_DIALOG.SEARCH_HINT')}
            supportText={t('CHAT.SHARE_DIALOG.SEARCH_HINT')}
            value={selectedTeamIds}
            onValueChange={setSelectedTeamIds}
            disabled={isReadOnly}
            panelSize="full"
            searchHint={t('COMMON.LABELS.SEARCH_HINT')}
            testidPrefix="room-share-team"
          />

          {showShareLinkActions && (
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border-weak pt-4">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
                aria-label={t('CHAT.SHARE_DIALOG.COPY_LINK')}
                onClick={handleCopyShareLink}
              >
                <span className="material-symbols-outlined text-lg">link</span>
                {t('CHAT.SHARE_DIALOG.COPY_LINK')}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-danger hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
                disabled={isUnsharing}
                aria-label={t('CHAT.SHARE_DIALOG.UNSHARE')}
                onClick={() => setIsUnshareConfirmOpen(true)}
              >
                <span className="material-symbols-outlined text-lg">link_off</span>
                {t('CHAT.SHARE_DIALOG.UNSHARE')}
              </button>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={isUnshareConfirmOpen}
        title={t('CHAT.SHARE_DIALOG.UNSHARE_CONFIRM_TITLE')}
        message={t('CHAT.SHARE_DIALOG.UNSHARE_CONFIRM_MESSAGE')}
        cancelText={t('COMMON.CANCEL')}
        confirmText={t('CHAT.SHARE_DIALOG.UNSHARE_CONFIRM_BUTTON')}
        confirmDanger
        confirmIcon="link_off"
        confirmLoading={isUnsharing}
        buttonAlign="center"
        showConfirm
        showCancel
        dialogWidth="800px"
        onClose={(confirmed) => {
          setIsUnshareConfirmOpen(false);
          if (confirmed) handleUnshare();
        }}
      />
    </>
  );
}
