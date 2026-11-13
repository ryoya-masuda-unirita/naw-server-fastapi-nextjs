import { useTranslation } from 'react-i18next';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import type { FileAttachment } from '@/types/chat/file-attachment.type';

interface ChatFilePreviewProps {
  files: FileAttachment[];
  onClose?: () => void;
  onDownload?: (file: FileAttachment) => void;
  onRemove?: (file: FileAttachment) => void;
}

const BYTES_UNIT = 1024;
const FILE_SIZE_UNITS = ['Bytes', 'KB', 'MB', 'GB'];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(BYTES_UNIT));
  return `${Math.round((bytes / Math.pow(BYTES_UNIT, i)) * 100) / 100} ${FILE_SIZE_UNITS[i]}`;
}

function getFileIcon(file: FileAttachment): string {
  const type = file.type.split('/')[0];
  switch (type) {
    case 'image':
      return 'image';
    case 'video':
      return 'videocam';
    case 'audio':
      return 'audiotrack';
    case 'application':
      return file.type.includes('pdf') ? 'picture_as_pdf' : 'description';
    default:
      return 'attach_file';
  }
}

const ICON_BUTTON_CLASS =
  'p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors';

/** 移植元 `<app-chat-file-preview>`。添付ファイルのプレビュー（移植元でもどの画面からも使われていない） */
export function ChatFilePreview({ files, onClose, onDownload, onRemove }: ChatFilePreviewProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      <div className="w-80 flex flex-col h-full bg-white border-l border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <button type="button" className={ICON_BUTTON_CLASS} aria-label={t('CHAT.VIEWER.BACK')}>
              <MatIcon name="keyboard_arrow_left" size={24} />
            </button>
            <h3 className="text-lg font-semibold text-gray-900">{t('CHAT.VIEWER.TITLE')}</h3>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className={ICON_BUTTON_CLASS} aria-label={t('CHAT.VIEWER.SHARE')}>
              <MatIcon name="share" size={24} />
            </button>
            <button
              type="button"
              onClick={() => onClose?.()}
              className={ICON_BUTTON_CLASS}
              aria-label={t('CHAT.FILE_PREVIEW.CLOSE')}
            >
              <MatIcon name="close" size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">{t('CHAT.VIEWER.DOCUMENT_TITLE')}</h2>
          </div>

          <div className="px-4 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <MatIcon name="info" size={24} className="text-gray-500" />
              <h3 className="text-base font-semibold text-gray-700">{t('CHAT.VIEWER.EXPLANATION')}</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{t('CHAT.VIEWER.EXPLANATION_TEXT')}</p>
          </div>

          {files.length > 0 && (
            <div className="px-4 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-700 mb-3">{t('CHAT.VIEWER.ATTACHMENTS')}</h3>
              <div className="space-y-3">
                {files.map((file) => (
                  <div key={file.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {file.type.startsWith('image/') && file.url ? (
                      <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                        <img src={file.url} alt={file.name} className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gray-100 flex items-center justify-center">
                        <MatIcon name={getFileIcon(file)} size={60} className="text-gray-400" />
                      </div>
                    )}

                    <div className="p-3">
                      <p className="text-sm font-medium text-gray-900 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{formatFileSize(file.size)}</p>

                      <div className="flex gap-2 mt-3">
                        {file.url && (
                          <button
                            type="button"
                            onClick={() => onDownload?.(file)}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <MatIcon name="download" size={16} />
                            <span>{t('CHAT.FILE_PREVIEW.DOWNLOAD')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemove?.(file)}
                          className="flex items-center justify-center gap-1 px-3 py-2 text-sm text-red-600 border border-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          aria-label={t('CHAT.FILE_PREVIEW.REMOVE')}
                        >
                          <MatIcon name="delete" size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {files.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <MatIcon name="folder_open" size={60} className="text-gray-300 mb-2" />
              <p className="text-gray-500">{t('CHAT.FILE_PREVIEW.EMPTY')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
