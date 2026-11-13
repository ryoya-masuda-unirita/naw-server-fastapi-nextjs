import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { chatAttachmentSlots } from './chat-attachment-slots';
import { ChatAttachMenuItem } from './chat-attachments';
import { ChatInput } from './chat-input';

const FIXTURE_PDF = new File(['pdf'], 'report.pdf', { type: 'application/pdf' });
const FIXTURE_IMAGE = new File(['img'], 'photo.png', { type: 'image/png' });
const FIXTURE_ZIP = new File(['zip'], 'archive.zip', { type: 'application/zip' });

function renderInput(onSend = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChatInput
          roomId={null}
          defaultAssistantId={null}
          onSend={onSend}
          {...chatAttachmentSlots}
          renderAddMenu={() => <ChatAttachMenuItem />}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function dropOnInput(container: HTMLElement, files: File[]) {
  fireEvent.drop(container.querySelector('.chat-input-textarea-wrap')!, {
    dataTransfer: { files },
  });
}

beforeEach(() => {
  // jsdom には URL.createObjectURL がないため、画像チップ用に差し替える
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('チャット入力の添付', () => {
  test('ドロップした許可済みのファイルをチップとして表示すること', () => {
    const { container } = renderInput();

    dropOnInput(container, [FIXTURE_PDF, FIXTURE_IMAGE]);

    const chips = screen.getAllByTestId('chat-attached-file-item');
    expect(chips).toHaveLength(1);
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByAltText('photo.png')).toBeInTheDocument();
  });

  test('許可されていない種類のファイルだけをドロップしても何も追加しないこと', () => {
    const { container } = renderInput();

    dropOnInput(container, [FIXTURE_ZIP]);

    expect(screen.queryByTestId('chat-attached-file-item')).not.toBeInTheDocument();
    expect(container.querySelector('.flex-wrap.gap-3.mb-3')).not.toBeInTheDocument();
  });

  test('許可外のファイルが混ざっていても許可されたものだけ追加すること', () => {
    const { container } = renderInput();

    dropOnInput(container, [FIXTURE_ZIP, FIXTURE_PDF]);

    expect(screen.getAllByTestId('chat-attached-file-item')).toHaveLength(1);
    expect(screen.queryByText('archive.zip')).not.toBeInTheDocument();
  });

  test('ファイル選択 input から選んだファイルを追加し、続けて同じファイルを選べるよう input を空に戻すこと', async () => {
    renderInput();
    const user = userEvent.setup();
    const input = screen.getByTestId<HTMLInputElement>('chat-attach-file-input');

    await user.upload(input, FIXTURE_PDF);

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  test('チップの削除ボタンで該当のファイルだけを外すこと', async () => {
    const { container } = renderInput();
    const user = userEvent.setup();
    dropOnInput(container, [FIXTURE_PDF, new File(['t'], 'notes.txt', { type: 'text/plain' })]);

    const removeButtons = screen.getAllByRole('button', { name: 'CHAT.INPUT.REMOVE_FILE' });
    await user.click(removeButtons[0]);

    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
  });

  test('添付だけでも送信でき、送信すると添付が空になること', async () => {
    const onSend = vi.fn();
    const { container } = renderInput(onSend);
    const user = userEvent.setup();
    dropOnInput(container, [FIXTURE_PDF]);

    await user.click(screen.getByTestId('chat-send-button'));

    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ files: [FIXTURE_PDF] }));
    await waitFor(() => {
      expect(screen.queryByTestId('chat-attached-file-item')).not.toBeInTheDocument();
    });
  });

  test('＋メニューの項目を押すとファイル選択を開き、メニューを閉じる通知を出すこと', async () => {
    const onSelected = vi.fn();
    render(
      <>
        <input id="chat-file-upload" type="file" />
        <ChatAttachMenuItem onSelected={onSelected} />
      </>,
    );
    const input = document.getElementById('chat-file-upload') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    await userEvent.setup().click(screen.getByTestId('chat-attach-menu-item'));

    expect(clickSpy).toHaveBeenCalled();
    expect(onSelected).toHaveBeenCalled();
  });
});
