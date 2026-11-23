import { useTranslation } from 'react-i18next';

interface ChatMessageLogoProps {
  isNewChat?: boolean;
  assistantDescription?: string;
}

/** 移植元 `<app-chat-message-logo>`。メッセージが空のときのロゴと見出し */
export function ChatMessageLogo({ isNewChat = false, assistantDescription = '' }: ChatMessageLogoProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center md:justify-start h-full md:h-auto min-h-56.5 md:min-h-auto p-4 md:p-0 md:pt-10 md:mb-6">
      <div className="mb-6 w-12">
        <img src="/logo-min.svg" alt="SecuRiGent Logo" className="w-12 h-12" />
      </div>
      <h3 className="text-h5 text-text-medium font-medium">
        {t(!isNewChat ? 'CHAT.EMPTY.TITLE' : 'CHAT.EMPTY.SUBTITLE')}
      </h3>
      {!isNewChat && assistantDescription && (
        <p className="text-body text-text-medium mt-1 text-center whitespace-pre-wrap wrap-break-word">
          {assistantDescription}
        </p>
      )}
    </div>
  );
}
