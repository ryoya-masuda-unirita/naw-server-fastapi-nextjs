import { useTranslation } from 'react-i18next';
import { ChatError } from './chat-error';

interface MessageErrorSectionProps {
  errorMessage: string;
}

/** 移植元 `<app-message-error-section>`。回答が ERROR のときの表示 */
export function MessageErrorSection({ errorMessage }: MessageErrorSectionProps) {
  const { t } = useTranslation();
  return (
    <>
      {/* 移植元が日本語をハードコードしているので、そのまま移す */}
      <p className="chat-error-badge">回答エラー</p>
      <div className="chat-message-bubble">
        <ChatError
          title={t('COMMON.MESSAGES.ERROR.GENERAL')}
          message={errorMessage || t('COMMON.MESSAGES.ERROR.SUPPORT_TEXT')}
        />
      </div>
    </>
  );
}
