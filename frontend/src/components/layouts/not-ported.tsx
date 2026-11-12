import { Outlet } from 'react-router-dom';

// 未移植の画面・ダイアログの目印。各画面の Issue で本物に置き換わり、全画面の移植が終わったらこのファイルごと消す。
// 表示文言は製品の文言ではなく開発用の目印のため、i18n 辞書（移植元のクローン）には入れない。

interface NotPortedProps {
  /** 移植元のコンポーネント名 */
  name: string;
  /** 移植を担当する Issue 番号。担当が決まっていなければ省略する */
  issue?: number;
}

const issueLabel = (issue?: number) => (issue ? `#${issue}` : '担当 Issue 未定');

export function NotPortedPage({ name, issue }: NotPortedProps) {
  return (
    <div className="flex flex-col gap-4 p-6" data-testid="not-ported-page">
      <p className="text-sm text-text-medium">
        未移植: {name}（{issueLabel(issue)}）
      </p>
      {/* 子ルート（グループ詳細のタブ等）も仮の画面のまま表示できるようにする */}
      <Outlet />
    </div>
  );
}

interface NotPortedDialogProps extends NotPortedProps {
  open: boolean;
  onClose: () => void;
}

export function NotPortedDialog({ name, issue, open, onClose }: NotPortedDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-bg-overlay">
      <div
        role="dialog"
        aria-label={name}
        className="flex flex-col gap-4 rounded-lg bg-surface-white p-6"
      >
        <p className="text-sm text-text-medium">
          未移植: {name}（{issueLabel(issue)}）
        </p>
        <button type="button" onClick={onClose} className="self-end text-sm text-primary">
          close
        </button>
      </div>
    </div>
  );
}
