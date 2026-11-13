import { useEffect, useRef } from 'react';
import './chat-reasoning-display.css';
import type { MessageReasoning } from '@/types/chat/message.type';

interface ChatReasoningDisplayProps {
  reasoning: MessageReasoning;
}

/** 移植元 `<app-chat-reasoning-display>`。思考過程。最後の詳細は更新のたびに末尾までスクロールする */
export function ChatReasoningDisplay({ reasoning }: ChatReasoningDisplayProps) {
  const lastDetailRef = useRef<HTMLDivElement | null>(null);
  const lastDetail = reasoning.sections[reasoning.sections.length - 1]?.detail;

  useEffect(() => {
    if (!lastDetail) return;
    const frame = requestAnimationFrame(() => {
      const el = lastDetailRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [reasoning, lastDetail]);

  const lastIndex = reasoning.sections.length - 1;
  return (
    <div className="block w-full max-w-full min-w-0 mb-1">
      {reasoning.sections.map((section, index) => (
        <div key={index} className="chat-reasoning-section">
          <p className="chat-reasoning-summary text-xs font-medium text-text-muted">{section.summary}</p>
          {section.detail && (
            <div
              ref={index === lastIndex ? lastDetailRef : null}
              className="chat-reasoning-detail overflow-y-auto text-xs text-text-weak"
              aria-live="polite"
            >
              {section.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
