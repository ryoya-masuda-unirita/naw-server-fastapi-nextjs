import type { ReferenceFilePaths } from '@/types/chat/message.type';

interface MessageReferenceProps {
  referenceFilePaths: ReferenceFilePaths[];
}

/** 移植元 `<app-reference>`。回答の参考資料リンク */
export function MessageReference({ referenceFilePaths }: MessageReferenceProps) {
  return (
    <div className="chat-ref-section">
      {/* 移植元が日本語をハードコードしているので、そのまま移す */}
      <p className="chat-ref-title">参考資料</p>
      <ul>
        {referenceFilePaths.map((ref, index) => (
          <li key={index}>
            <a href={ref.url} target="_blank" rel="noopener noreferrer">
              {ref.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
