import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { useChatStore } from '@/store/chat-store';
import { useMessagesStore } from '@/store/messages-store';
import { FIXTURE_GENERAL_USER, renderApp, setAuthUser } from '@/test/render-app';

/** ページは遅延読み込みなので、初回は読み込みに時間がかかることがある */
const LAZY_LOAD_TIMEOUT = { timeout: 5000 };

beforeEach(() => {
  setAuthUser(FIXTURE_GENERAL_USER);
  useChatStore.setState({ activeRoomId: null });
  useMessagesStore.getState().clearMessages();
});

describe('ChatAssistantPage（/chat/assistant）', () => {
  test('メッセージ一覧の代わりに回答の見本と、通常のチャットと同じ入力欄を出すこと', async () => {
    renderApp('/chat/assistant');

    expect(await screen.findByText('見出し h1', {}, LAZY_LOAD_TIMEOUT)).toBeInTheDocument();
    expect(screen.getByText('参考資料付き')).toBeInTheDocument();
    expect(screen.getByText('その他テキストスタイル')).toBeInTheDocument();
    expect(screen.getByTestId('chat-input-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('chat-attach-button')).toBeInTheDocument();
  });

  test('ヘッダーのルーム名を隠すこと', async () => {
    const { container } = renderApp('/chat/assistant');

    await screen.findByText('見出し h1', {}, LAZY_LOAD_TIMEOUT);
    expect(container.querySelector('.chat-page-header')).toHaveClass('hidden');
  });

  test('コードのコピーを押すと一時的に「コピー済み」の表示になること', async () => {
    const user = userEvent.setup();
    const { container } = renderApp('/chat/assistant');

    await user.click(await screen.findByRole('button', { name: /コードをコピー/ }, LAZY_LOAD_TIMEOUT));

    expect(container.querySelector('.chat-code-copy-btn')).toHaveClass('is-copied');
  });
});
