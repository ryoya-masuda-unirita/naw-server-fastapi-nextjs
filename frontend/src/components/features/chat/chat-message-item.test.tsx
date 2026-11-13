import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import type { Message } from '@/types/chat/message.type';
import { ChatMessageItem } from './chat-message-item';

const FIXTURE_ASSISTANT = {
  id: 'a1',
  tenantId: 't1',
  type: 'SAAS_CHAT',
  endpoints: [],
  name: '社内アシスタント',
  indexId: null,
  category: null,
  groups: [],
  description: '',
  includeHistory: false,
  iconColor: '#000',
};

function buildMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'c1',
    messageId: 'm1',
    role: 'user',
    status: 'OK',
    question: '質問です',
    answer: '',
    context: '',
    isRated: false,
    assistantId: 'a1',
    ...overrides,
  };
}

function renderItem(message: Message, props: Partial<React.ComponentProps<typeof ChatMessageItem>> = {}) {
  server.use(http.get(mockPath(API_PATHS.ASSISTANTS.LIST), () => HttpResponse.json([FIXTURE_ASSISTANT])));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatMessageItem message={message} {...props} />
    </QueryClientProvider>,
  );
}

describe('ChatMessageItem（ユーザー）', () => {
  test('質問を表示し、編集で再送信すると編集後の本文が渡ること', async () => {
    const onEditSend = vi.fn();
    renderItem(buildMessage(), { onEditSend });
    const user = userEvent.setup();
    expect(screen.getByText('質問です')).toBeInTheDocument();

    // アシスタント一覧が届くまで、編集は押せない（解決できないアシスタントとして扱う）
    const editButton = screen.getByRole('button', { name: 'CHAT.MESSAGE.EDIT' });
    await waitFor(() => expect(editButton).toBeEnabled());
    await user.click(editButton);
    const textarea = screen.getByDisplayValue('質問です');
    await user.clear(textarea);
    await user.type(textarea, '直した質問');
    await user.click(screen.getByRole('button', { name: 'CHAT.MESSAGE.RESEND' }));

    expect(onEditSend).toHaveBeenCalledWith('直した質問');
  });

  test('編集中に空にすると再送信されないこと', async () => {
    const onEditSend = vi.fn();
    renderItem(buildMessage(), { onEditSend });
    const user = userEvent.setup();
    const editButton = screen.getByRole('button', { name: 'CHAT.MESSAGE.EDIT' });
    await waitFor(() => expect(editButton).toBeEnabled());

    await user.click(editButton);
    await user.clear(screen.getByDisplayValue('質問です'));
    await user.click(screen.getByRole('button', { name: 'CHAT.MESSAGE.RESEND' }));

    expect(onEditSend).not.toHaveBeenCalled();
  });

  test('編集中の Enter で再送信し、Shift+Enter では送らないこと', async () => {
    const onEditSend = vi.fn();
    renderItem(buildMessage(), { onEditSend });
    const user = userEvent.setup();
    const editButton = screen.getByRole('button', { name: 'CHAT.MESSAGE.EDIT' });
    await waitFor(() => expect(editButton).toBeEnabled());

    await user.click(editButton);
    await user.type(screen.getByDisplayValue('質問です'), '{Shift>}{Enter}{/Shift}');
    expect(onEditSend).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox'), '{Enter}');

    expect(onEditSend).toHaveBeenCalledTimes(1);
  });

  test('削除は確認ダイアログで承認すると messageId が渡ること', async () => {
    const onDelete = vi.fn();
    renderItem(buildMessage(), { onDelete });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByText('CHAT.MESSAGE.DELETE_USER_TITLE')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /COMMON.DELETE/ }));

    expect(onDelete).toHaveBeenCalledWith('m1');
  });

  test('削除の確認でキャンセルすると何も呼ばれないこと', async () => {
    const onDelete = vi.fn();
    renderItem(buildMessage(), { onDelete });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '削除' }));
    await user.click(screen.getByRole('button', { name: 'COMMON.CANCEL' }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  test('読み取り専用では編集・削除の操作が隠れること', () => {
    renderItem(buildMessage(), { isReadOnly: true });

    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CHAT.MESSAGE.EDIT' })).not.toBeInTheDocument();
  });

  test('版が複数あるときは「現在/総数」と切り替えボタンが出て、押すと通知されること', async () => {
    const onPrevVersion = vi.fn();
    const onNextVersion = vi.fn();
    renderItem(buildMessage(), {
      versionInfo: { groupKey: 'g', current: 2, total: 3, canPrev: true, canNext: false },
      onPrevVersion,
      onNextVersion,
    });
    const user = userEvent.setup();

    expect(screen.getByText('2/3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'CHAT.MESSAGE.PREV_VERSION' }));
    expect(onPrevVersion).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'CHAT.MESSAGE.NEXT_VERSION' })).toBeDisabled();
  });

  test('コピーで質問をクリップボードへ書き込むこと', async () => {
    const onCopy = vi.fn();
    renderItem(buildMessage(), { onCopy });
    // userEvent.setup() が navigator.clipboard を差し替えるので、そのあとで spy する
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');

    await user.click(screen.getByRole('button', { name: 'コピー' }));

    expect(writeText).toHaveBeenCalledWith('質問です');
    expect(onCopy).toHaveBeenCalledWith('c1');
  });
});

describe('ChatMessageItem（アシスタント）', () => {
  const assistantMessage = (overrides: Partial<Message> = {}) =>
    buildMessage({ role: 'assistant', question: '', answer: '回答です', ...overrides });

  test('アシスタント名が解決できたら名前と回答を表示すること', async () => {
    renderItem(assistantMessage());

    expect(await screen.findByText('社内アシスタント')).toBeInTheDocument();
    expect(screen.getByText('回答です')).toBeInTheDocument();
  });

  test('解決できないアシスタントは「不明なアシスタント」で、再生成できないこと', async () => {
    renderItem(assistantMessage({ assistantId: 'unknown' }));

    expect(await screen.findByText('CHAT.MESSAGE.UNKNOWN_ASSISTANT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再生成' })).toBeDisabled();
  });

  test('回答待ち（本文なしの PENDING）ではローディングを出しフッターを出さないこと', () => {
    renderItem(assistantMessage({ status: 'PENDING', answer: '' }));

    expect(screen.queryByRole('button', { name: 'コピー' })).not.toBeInTheDocument();
    expect(screen.queryByText('回答です')).not.toBeInTheDocument();
  });

  test('ERROR のときはエラー表示にメッセージを出すこと', () => {
    renderItem(assistantMessage({ status: 'ERROR', answer: '', message: '失敗しました' }));

    expect(screen.getByText('回答エラー')).toBeInTheDocument();
    expect(screen.getByText('失敗しました')).toBeInTheDocument();
  });

  test('参考資料があればリンクを出すこと', () => {
    renderItem(assistantMessage({ referenceFilePaths: [{ name: '規程.pdf', url: 'https://example.com/a.pdf' }] }));

    expect(screen.getByRole('link', { name: '規程.pdf' })).toHaveAttribute('href', 'https://example.com/a.pdf');
  });

  test('評価ボタンで up / down が messageId つきで通知され、評価済みの側は押せないこと', async () => {
    const onRate = vi.fn();
    renderItem(assistantMessage({ rating: 'GOOD' }), { onRate });
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: '良い' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '良くない' }));

    expect(onRate).toHaveBeenCalledWith({ messageId: 'm1', rating: 'down' });
  });

  test('再生成で content の id が渡ること', async () => {
    const onRegenerate = vi.fn();
    renderItem(assistantMessage(), { onRegenerate });
    const user = userEvent.setup();
    const regenerate = screen.getByRole('button', { name: '再生成' });
    await waitFor(() => expect(regenerate).toBeEnabled());

    await user.click(regenerate);

    expect(onRegenerate).toHaveBeenCalledWith('c1');
  });

  test('思考過程があれば表示すること', () => {
    renderItem(assistantMessage({ reasoning: { sections: [{ summary: '考え中', detail: '詳細' }] } }));

    expect(screen.getByText('考え中')).toBeInTheDocument();
    expect(screen.getByText('詳細')).toBeInTheDocument();
  });
});
