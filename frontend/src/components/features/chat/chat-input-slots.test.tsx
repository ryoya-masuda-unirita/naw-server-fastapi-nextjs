import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { ChatInput } from './chat-input';
import { CHAT_INPUT_SLOTS } from './chat-input-slots';

function buildApiAssistant(id: string, name: string, category: string, isDefault = false) {
  return {
    id,
    tenantId: 't1',
    type: 'SAAS_CHAT',
    endpoints: [{ id: 'e', label: null, url: 'u', model: 'gpt', type: 'x' }],
    name,
    indexId: null,
    category,
    groups: [],
    description: `${name}の説明`,
    includeHistory: false,
    iconColor: '#000',
    isDefault,
  };
}

const FIXTURE_TEMPLATES = {
  content: [
    { id: 't1', name: '要約', description: '長文を要約する', systemPrompt: 'summarize' },
    { id: 't2', name: '翻訳', description: '英語にする', systemPrompt: 'translate' },
  ],
};

function renderInput() {
  server.use(
    http.get(mockPath(API_PATHS.ASSISTANTS.LIST), () =>
      HttpResponse.json([
        buildApiAssistant('a1', 'Alpha', '営業', true),
        buildApiAssistant('a2', 'Beta', '開発'),
        buildApiAssistant('a3', 'Gamma', '開発'),
      ]),
    ),
    http.get(mockPath(API_PATHS.PROMPT_TEMPLATES.LIST), () => HttpResponse.json(FIXTURE_TEMPLATES)),
  );
  const onSend = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatInput
        roomId={null}
        defaultAssistantId={null}
        onSend={onSend}
        {...CHAT_INPUT_SLOTS}
      />
    </QueryClientProvider>,
  );
  const textarea = screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement;
  return { onSend, textarea, user: userEvent.setup() };
}

/** 初期アシスタント（既定の Alpha）が選ばれるまで待つ */
async function waitForSelectedAssistant(name = 'Alpha') {
  await waitFor(() => expect(screen.getByTestId('assistant-select-button')).toHaveTextContent(name));
}

afterEach(() => {
  // 開いたままのドロップダウンを次のテストに持ち越さない
  document.body.click();
});

describe('アシスタント選択', () => {
  test('初期アシスタントがボタンに表示され、一覧から選び直せること', async () => {
    const { user } = renderInput();
    await waitForSelectedAssistant();

    await user.click(screen.getByTestId('assistant-select-button'));
    const options = screen.getAllByTestId('assistant-option-item');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(within(options[1]).getByText('開発')).toBeInTheDocument();

    await user.click(options[1]);

    expect(screen.getByTestId('assistant-select-button')).toHaveTextContent('Beta');
    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
  });

  test('選んだアシスタントが送信に載ること', async () => {
    const { user, onSend, textarea } = renderInput();
    await waitForSelectedAssistant();

    await user.click(screen.getByTestId('assistant-select-button'));
    await user.click(screen.getAllByTestId('assistant-option-item')[2]);
    await user.type(textarea, 'こんにちは{Enter}');

    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ assistantId: 'a3' }));
  });

  test('外側をクリックすると一覧が閉じること', async () => {
    const { user } = renderInput();
    await waitForSelectedAssistant();

    await user.click(screen.getByTestId('assistant-select-button'));
    expect(screen.getByRole('listbox')).toBeVisible();

    await user.click(document.body);

    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
  });
});

describe('メンション', () => {
  test('「@」と入力すると候補が出て、検索語で絞り込めること', async () => {
    const { user, textarea } = renderInput();
    await waitForSelectedAssistant();

    await user.type(textarea, '@');
    expect(document.querySelectorAll('.mention-option')).toHaveLength(3);

    await user.type(textarea, '開発');
    const candidates = Array.from(document.querySelectorAll('.mention-option'));
    expect(candidates.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Beta'),
      expect.stringContaining('Gamma'),
    ]);
  });

  test('Enter で候補を選ぶと、アシスタントが切り替わり「@検索語」が消えること', async () => {
    const { user, textarea, onSend } = renderInput();
    await waitForSelectedAssistant();

    await user.type(textarea, '@gam{Enter}');

    expect(screen.getByTestId('assistant-select-button')).toHaveTextContent('Gamma');
    expect(textarea.value).toBe('');
    expect(onSend).not.toHaveBeenCalled();
  });

  test('「@検索語」のあとに本文があっても、候補を選ぶと本文だけが残ること', async () => {
    const { user, textarea } = renderInput();
    await waitForSelectedAssistant();

    await user.type(textarea, '@beta 質問です');
    await user.keyboard('{Enter}');

    // 本文が残っている間は候補の確定と同時に @ が消え、続けて Enter で送信できる状態になる
    expect(screen.getByTestId('assistant-select-button')).toHaveTextContent('Beta');
    expect(textarea.value).toBe('質問です');
  });

  test('矢印キーで選択位置を動かして Tab で確定できること', async () => {
    const { user, textarea } = renderInput();
    await waitForSelectedAssistant();

    await user.type(textarea, '@{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}{Tab}');

    // Alpha(0) -> Beta(1) -> Gamma(2) -> 末尾で止まる -> 1 つ戻って Beta
    expect(screen.getByTestId('assistant-select-button')).toHaveTextContent('Beta');
  });

  test('候補にマウスを乗せて選べること', async () => {
    const { user, textarea } = renderInput();
    await waitForSelectedAssistant();

    await user.type(textarea, '@');
    const gamma = screen.getByText('Gamma', { selector: '.mention-option span' });
    await user.click(gamma);

    expect(screen.getByTestId('assistant-select-button')).toHaveTextContent('Gamma');
    expect(textarea.value).toBe('');
  });

  test('Esc で候補を閉じ、続けて入力すると開き直すこと', async () => {
    const { user, textarea } = renderInput();
    await waitForSelectedAssistant();

    await user.type(textarea, '@{Escape}');
    expect(document.querySelector('.mention-panel')).toBeNull();

    await user.type(textarea, 'b');
    expect(document.querySelector('.mention-panel')).not.toBeNull();
  });

  test('該当がないときは空のメッセージを出し、Enter では何も起きないこと', async () => {
    const { user, textarea, onSend } = renderInput();
    await waitForSelectedAssistant();

    await user.type(textarea, '@zzz{Enter}');

    expect(screen.getByText('CHAT.INPUT.ASSISTANT_MENTION_EMPTY')).toBeInTheDocument();
    expect(textarea.value).toBe('@zzz');
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('「＋」メニューと有効な機能', () => {
  test('Web 検索を有効にすると、ツールバーに名前付きで出て、×で外せること', async () => {
    const { user } = renderInput();
    await waitForSelectedAssistant();

    await user.click(screen.getByTestId('chat-attach-button'));
    await user.click(screen.getByText('CHAT.INPUT.WEB_SEARCH', { selector: 'span.flex-1' }));
    await user.click(screen.getByTestId('chat-attach-button'));

    const widget = document.querySelector('[data-chat-active-btn]') as HTMLElement;
    expect(within(widget).getByText('CHAT.INPUT.WEB_SEARCH')).toBeInTheDocument();

    await user.click(within(widget).getByRole('button', { name: 'COMMON.CLOSE' }));

    expect(document.querySelector('[data-chat-active-btn]')).toBeNull();
  });

  test('有効な機能が 2 つ以上なら件数付きのボタンになり、パネルから個別に外せること', async () => {
    const { user, onSend, textarea } = renderInput();
    await waitForSelectedAssistant();

    await user.click(screen.getByTestId('chat-attach-button'));
    await user.click(screen.getByText('CHAT.INPUT.WEB_SEARCH', { selector: 'span.flex-1' }));
    await user.click(screen.getByTestId('chat-create-library-toggle'));
    await user.click(screen.getByTestId('chat-attach-button'));

    const manage = screen.getByRole('button', { name: 'CHAT.INPUT.MANAGE_ACTIVE_FEATURES' });
    expect(manage).toHaveTextContent('2');

    await user.click(manage);
    const panel = screen.getByRole('menu', { name: 'CHAT.INPUT.MANAGE_ACTIVE_FEATURES' });
    await user.click(within(panel).getAllByRole('button', { name: 'COMMON.CLOSE' })[0]);

    // 残りは 1 つ（ライブラリ作成）なので、件数付きボタンは名前付きの表示に戻る
    expect(screen.queryByRole('menu', { name: 'CHAT.INPUT.MANAGE_ACTIVE_FEATURES' })).toBeNull();
    expect(
      within(document.querySelector('[data-chat-active-btn]') as HTMLElement).getByText(
        'CHAT.INPUT.CREATE_LIBRARY',
      ),
    ).toBeInTheDocument();

    await user.type(textarea, '本文{Enter}');
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ useWebSearch: false, createLibrary: true }),
    );
  });

  test('テンプレートを選ぶと、システムプロンプトが送信に載ること', async () => {
    const { user, onSend, textarea } = renderInput();
    await waitForSelectedAssistant();

    await user.click(screen.getByTestId('chat-attach-button'));
    await user.click(screen.getByText('CHAT.INPUT.TEMPLATE'));
    await user.click(await screen.findByText('翻訳'));

    // 選んだテンプレート名がツールバーに出る
    const widget = document.querySelector('[data-chat-active-btn]') as HTMLElement;
    expect(within(widget).getByText('翻訳')).toBeInTheDocument();

    await user.type(textarea, '本文{Enter}');
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ additionalPrompt: 'translate' }));
  });

  test('「＋」メニューの外側をクリックすると閉じること', async () => {
    const { user } = renderInput();
    await waitForSelectedAssistant();

    await user.click(screen.getByTestId('chat-attach-button'));
    expect(screen.getByTestId('chat-attach-menu-item')).toBeVisible();

    await user.click(document.body);

    expect(screen.getByTestId('chat-attach-menu-item', { exact: false })).not.toBeVisible();
  });

  test('添付の項目は、入力欄内の file input をクリックすること', async () => {
    const { user } = renderInput();
    await waitForSelectedAssistant();
    // 添付の領域（#287）が置く input の代わり
    const input = document.createElement('input');
    input.type = 'file';
    document.querySelector('.chat-input-textarea-wrap')?.appendChild(input);
    const click = vi.spyOn(input, 'click');

    await user.click(screen.getByTestId('chat-attach-button'));
    await user.click(screen.getByTestId('chat-attach-menu-item'));

    expect(click).toHaveBeenCalledTimes(1);
  });
});
