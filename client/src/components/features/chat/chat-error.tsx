import { SvgIcon } from '@/components/shared/icons/svg-icon';

interface ChatErrorProps {
  title: string;
  message: string;
}

/** 移植元 `<app-chat-error>`（features/chat/components/chat-error）。赤い帯のエラー表示 */
export function ChatError({ title, message }: ChatErrorProps) {
  return (
    // w-fulll は移植元のタイプミスだが、見た目を揃えるためそのまま移す（存在しないクラスなので幅指定なしと同じ）
    <div className="flex flex-col gap-2 w-fulll p-4 rounded-xl bg-bg-error" role="alert">
      <div className="flex gap-1 items-start">
        <span className="shrink-0 pt-px" aria-hidden="true">
          <SvgIcon name="error" className="w-5 h-5 text-status-error" />
        </span>
        <p className="flex-1 min-w-0 text-label-x-large font-medium text-text-strong">{title}</p>
      </div>
      <p className="text-body-small font-normal text-text-strong leading-[1.7]">{message}</p>
    </div>
  );
}
