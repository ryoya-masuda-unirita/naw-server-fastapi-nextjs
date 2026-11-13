import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { ChatInput } from './chat-input';

function buildApiAssistant(id: string, isDefault = false) {
  return {
    id,
    tenantId: 't1',
    type: 'SAAS_CHAT',
    endpoints: [{ id: 'e', label: null, url: 'u', model: 'gpt', type: 'x' }],
    name: id,
    indexId: null,
    category: null,
    groups: [],
    description: '',
    includeHistory: false,
    iconColor: '#000',
    isDefault,
  };
}

function renderInput(props: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  server.use(
    http.get(mockPath(API_PATHS.ASSISTANTS.LIST), () =>
      HttpResponse.json([buildApiAssistant('a1'), buildApiAssistant('a2')]),
    ),
  );
  const onSend = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatInput roomId={null} defaultAssistantId={null} onSend={onSend} {...props} />
    </QueryClientProvider>,
  );
  return { onSend, textarea: screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement };
}

describe('ChatInput', () => {
  test('空のときは送信ボタンが押せないこと', () => {
    renderInput();

    expect(screen.getByTestId('chat-send-button')).toBeDisabled();
  });

  test('入力して送信すると内容と選択中のアシスタントが渡り、入力欄が空に戻ること', async () => {
    const { onSend, textarea } = renderInput();
    const user = userEvent.setup();

    await user.type(textarea, 'こんにちは');
    // アシスタント一覧が届いて初期アシスタントが決まるのを待つ
    await waitFor(async () => {
      await user.click(screen.getByTestId('chat-send-button'));
      expect(onSend).toHaveBeenCalled();
    });

    expect(onSend).toHaveBeenCalledWith({
      content: 'こんにちは',
      files: [],
      assistantId: expect.any(String),
      useWebSearch: false,
      additionalPrompt: undefined,
      createLibrary: false,
    });
    expect(textarea.value).toBe('');
  });

  test('Enter で送信し、Shift+Enter は改行になること', async () => {
    const { onSend, textarea } = renderInput();
    const user = userEvent.setup();

    await user.type(textarea, '1行目{Shift>}{Enter}{/Shift}2行目');
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea.value).toBe('1行目\n2行目');

    await user.type(textarea, '{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0].content).toBe('1行目\n2行目');
  });

  test('日本語入力の変換確定の Enter では送信しないこと', () => {
    const { onSend, textarea } = renderInput();

    fireEvent.change(textarea, { target: { value: 'にほんご' } });
    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.compositionEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  test('「@」で始まる入力は、メンションの選択中として送信できないこと', async () => {
    const { onSend, textarea } = renderInput();
    const user = userEvent.setup();

    await user.type(textarea, '@abc{Enter}');

    expect(screen.getByTestId('chat-send-button')).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  test('isError のときはエラー表示を出すこと', () => {
    renderInput({ isError: true });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('CHAT.MESSAGE.ERROR_TITLE')).toBeInTheDocument();
  });

  test('注意書きを表示すること', () => {
    renderInput();

    expect(screen.getByText('CHAT.INPUT.DISCLAIMER')).toBeInTheDocument();
  });

  test('別 Issue の部品は、移植元と同じ位置のスロットに差し込めること', () => {
    renderInput({
      renderAddMenu: () => <span>add-menu</span>,
      renderToolbar: () => <span>toolbar</span>,
      renderMention: () => <span>mention</span>,
      renderAttachments: () => <span>attachments</span>,
    });

    expect(screen.getByText('add-menu').closest('[data-chat-add-menu]')).not.toBeNull();
    expect(screen.getByText('toolbar')).toBeInTheDocument();
    expect(screen.getByText('mention')).toBeInTheDocument();
    expect(screen.getByText('attachments')).toBeInTheDocument();
  });

  test('onTextareaKeyDown が true を返したキーは送信に使われないこと', async () => {
    const { onSend, textarea } = renderInput({ onTextareaKeyDown: () => true });
    const user = userEvent.setup();

    await user.type(textarea, '内容{Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  test('ファイルをドロップすると onDropFiles に渡ること', () => {
    const onDropFiles = vi.fn();
    renderInput({ onDropFiles });
    const wrap = document.querySelector('.chat-input-textarea-wrap') as HTMLElement;
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });

    fireEvent.dragOver(wrap);
    expect(wrap).toHaveAttribute('data-drag-over', 'true');
    fireEvent.drop(wrap, { dataTransfer: { files: [file] } });

    expect(wrap).toHaveAttribute('data-drag-over', 'false');
    expect(onDropFiles).toHaveBeenCalledWith([file], expect.any(Object));
  });
});
