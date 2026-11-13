import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { FileAttachment } from '@/types/chat/file-attachment.type';
import { ChatAlert } from './chat-alert';
import { ChatClaude } from './chat-claude';
import {
  ChatDataPanel,
  VIEWER_WIDTH_COLLAPSED,
  VIEWER_WIDTH_EXPANDED,
  VIEWER_WIDTH_MAX,
  VIEWER_WIDTH_MIN,
} from './chat-data-panel';
import { ChatError } from './chat-error';
import { ChatFilePreview } from './chat-file-preview';
import { ChatMessageLogo } from './chat-message-logo';
import { ChatReasoningDisplay } from './chat-reasoning-display';

describe('ChatAlert / ChatError', () => {
  test('ChatAlert はタイトルと本文を出し、閉じるボタンで通知すること', async () => {
    const onDismiss = vi.fn();
    render(<ChatAlert title="注意" message="本文" onDismiss={onDismiss} />);

    expect(screen.getByRole('alert')).toHaveTextContent('注意');
    await userEvent.click(screen.getByRole('button', { name: 'CHAT.ALERT.CLOSE' }));

    expect(onDismiss).toHaveBeenCalled();
  });

  test('ChatError はタイトルと本文を出すこと', () => {
    render(<ChatError title="エラー" message="本文" />);

    expect(screen.getByRole('alert')).toHaveTextContent('エラー');
    expect(screen.getByRole('alert')).toHaveTextContent('本文');
  });
});

describe('ChatMessageLogo', () => {
  test('ルームでは見出しとアシスタントの説明を出すこと', () => {
    render(<ChatMessageLogo isNewChat={false} assistantDescription={'説明\n2行目'} />);

    expect(screen.getByRole('heading')).toHaveTextContent('CHAT.EMPTY.TITLE');
    const description = screen.getByText(/説明/);
    expect(description).toHaveClass('whitespace-pre-wrap');
  });

  test('新規チャットでは説明を出さず別の見出しにすること', () => {
    render(<ChatMessageLogo isNewChat assistantDescription="説明" />);

    expect(screen.getByRole('heading')).toHaveTextContent('CHAT.EMPTY.SUBTITLE');
    expect(screen.queryByText('説明')).not.toBeInTheDocument();
  });
});

describe('ChatReasoningDisplay', () => {
  test('各セクションの要約と詳細を出し、詳細がなければ要約だけにすること', () => {
    render(
      <ChatReasoningDisplay
        reasoning={{
          sections: [
            { summary: '要約1', detail: '詳細1' },
            { summary: '要約2', detail: '' },
          ],
        }}
      />,
    );

    expect(screen.getByText('要約1')).toBeInTheDocument();
    expect(screen.getByText('詳細1')).toBeInTheDocument();
    expect(screen.getByText('要約2')).toBeInTheDocument();
    expect(document.querySelectorAll('.chat-reasoning-detail')).toHaveLength(1);
  });
});

describe('ChatFilePreview', () => {
  const FILE: FileAttachment = { id: 'f1', name: 'report.pdf', type: 'application/pdf', size: 2048, url: 'blob:x' };

  test('ファイルがなければ空の表示を出すこと', () => {
    render(<ChatFilePreview files={[]} />);

    expect(screen.getByText('CHAT.FILE_PREVIEW.EMPTY')).toBeInTheDocument();
  });

  test('ファイル名とサイズを出し、ダウンロード・削除・閉じるを通知すること', async () => {
    const onDownload = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();
    render(<ChatFilePreview files={[FILE]} onDownload={onDownload} onRemove={onRemove} onClose={onClose} />);
    const user = userEvent.setup();

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /CHAT.FILE_PREVIEW.DOWNLOAD/ }));
    await user.click(screen.getByRole('button', { name: 'CHAT.FILE_PREVIEW.REMOVE' }));
    await user.click(screen.getByRole('button', { name: 'CHAT.FILE_PREVIEW.CLOSE' }));

    expect(onDownload).toHaveBeenCalledWith(FILE);
    expect(onRemove).toHaveBeenCalledWith(FILE);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ChatDataPanel', () => {
  test('既定の幅で出て、中身のスロットに折りたたみの通知を渡すこと', () => {
    const onCollapseChange = vi.fn();
    render(
      <ChatDataPanel
        roomId="r1"
        onCollapseChange={onCollapseChange}
        renderSummary={({ roomId, onCollapseChange: collapse }) => (
          <button onClick={() => collapse(true)}>summary-{roomId}</button>
        )}
      />,
    );
    const panel = screen.getByRole('complementary', { name: 'ビューワー' });
    expect(panel).toHaveStyle({ width: `${VIEWER_WIDTH_EXPANDED}px` });

    fireEvent.click(screen.getByText('summary-r1'));

    expect(onCollapseChange).toHaveBeenCalledWith(true);
    expect(panel).toHaveStyle({ width: `${VIEWER_WIDTH_COLLAPSED}px` });
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  test('左端のつまみをドラッグすると幅が変わり、最小・最大で止まること', () => {
    render(<ChatDataPanel roomId="r1" />);
    const panel = screen.getByRole('complementary');
    const handle = screen.getByRole('separator');
    panel.getBoundingClientRect = () => ({ width: VIEWER_WIDTH_EXPANDED }) as DOMRect;

    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 450 });
    expect(panel).toHaveStyle({ width: `${VIEWER_WIDTH_EXPANDED + 50}px` });
    fireEvent.mouseMove(document, { clientX: 5000 });
    expect(panel).toHaveStyle({ width: `${VIEWER_WIDTH_MIN}px` });
    fireEvent.mouseMove(document, { clientX: -5000 });
    expect(panel).toHaveStyle({ width: `${VIEWER_WIDTH_MAX}px` });
    fireEvent.mouseUp(document);
    fireEvent.mouseMove(document, { clientX: 450 });

    expect(panel).toHaveStyle({ width: `${VIEWER_WIDTH_MAX}px` });
  });
});

describe('ChatClaude', () => {
  test('単一選択の質問で選び、次へ進み、最後に送信すると回答が渡ること', async () => {
    const onSubmit = vi.fn();
    render(
      <ChatClaude
        questions={[
          { text: '質問1', options: ['A', 'B'] },
          { text: '質問2', options: ['C', 'D'], multi: true },
        ]}
        onSubmit={onSubmit}
      />,
    );
    const user = userEvent.setup();

    expect(screen.getByText('質問1')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('質問2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'すべて選択' }));
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(onSubmit).toHaveBeenCalledWith([
      { selectedIndex: 1, selectedIndices: [], otherText: '' },
      { selectedIndex: null, selectedIndices: [0, 1], otherText: '' },
    ]);
  });

  test('スキップすると現在の回答を消して次へ進むこと', async () => {
    const onSubmit = vi.fn();
    render(<ChatClaude questions={[{ text: '質問1', options: ['A'] }]} onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('option', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: 'スキップ' }));

    expect(onSubmit).toHaveBeenCalledWith([{ selectedIndex: null, selectedIndices: [], otherText: '' }]);
  });

  test('「その他」を入力すると選択肢の選択が外れること', async () => {
    const onSubmit = vi.fn();
    render(<ChatClaude questions={[{ text: '質問1', options: ['A'] }]} onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('option', { name: 'A' }));
    await user.type(screen.getByPlaceholderText('その他を入力'), 'memo');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(onSubmit).toHaveBeenCalledWith([{ selectedIndex: null, selectedIndices: [], otherText: 'memo' }]);
  });

  test('閉じるボタンで通知すること', async () => {
    const onClose = vi.fn();
    render(<ChatClaude onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onClose).toHaveBeenCalled();
  });
});
