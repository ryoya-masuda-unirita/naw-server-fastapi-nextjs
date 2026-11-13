import { createElement, type ReactNode } from 'react';
import { ChatSummaryConnected } from './chat-summary';

/**
 * `ChatDataPanel` の `renderSummary`・`ChatWindow` の `renderViewer` の既定。
 * 一覧の読み込み（`loadList`）は `ChatDataPanel` が行うので、ここでは行わない。
 */
export function renderChatSummary(params: {
  roomId: string | null;
  isReadOnly: boolean;
  onCollapseChange: (collapsed: boolean) => void;
}): ReactNode {
  return createElement(ChatSummaryConnected, params);
}
