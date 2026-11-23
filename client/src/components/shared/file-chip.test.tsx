import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileChip } from './file-chip';
import { FileChipDocument } from './file-chip-document';
import { FileImageChip } from './file-image-chip';

const FIXTURE_PDF = new File(['x'], 'report.pdf', { type: 'application/pdf' });
const FIXTURE_IMAGE = new File(['x'], 'photo.png', { type: 'image/png' });
const FIXTURE_PREVIEW_URL = 'blob:preview-1';

describe('FileChip', () => {
  test.each([
    ['PDF は PDF', new File(['x'], 'a.pdf', { type: 'application/pdf' }), 'PDF'],
    [
      'Word は DOC',
      new File(['x'], 'a.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      'DOC',
    ],
    ['Excel は XLS', new File(['x'], 'a.xls', { type: 'application/vnd.ms-excel' }), 'XLS'],
    ['画像は形式名', new File(['x'], 'a.png', { type: 'image/png' }), 'PNG'],
    ['不明な種別は拡張子', new File(['x'], 'a.csv', { type: '' }), 'CSV'],
  ])('ファイル名と種別ラベル（%s）を表示すること', (_label, file, expected) => {
    render(<FileChip file={file} />);
    expect(screen.getByText(file.name)).toBeInTheDocument();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  test('削除ボタンで削除を通知すること', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<FileChip file={FIXTURE_PDF} onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: 'CHAT.INPUT.REMOVE_FILE' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('showRemoveBtn が false のとき削除ボタンを出さないこと', () => {
    render(<FileChip file={FIXTURE_PDF} showRemoveBtn={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-attached-file-item')).toBeInTheDocument();
  });
});

describe('FileImageChip', () => {
  beforeEach(() => {
    // jsdom は URL.createObjectURL を持たないので差し替える
    URL.createObjectURL = vi.fn(() => FIXTURE_PREVIEW_URL);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('画像のプレビューを表示し、外すと URL を解放すること', () => {
    const { unmount } = render(<FileImageChip file={FIXTURE_IMAGE} />);
    expect(screen.getByRole('img', { name: 'photo.png' })).toHaveAttribute('src', FIXTURE_PREVIEW_URL);

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(FIXTURE_PREVIEW_URL);
  });

  test('画像でないファイルはプレビュー URL を作らないこと', () => {
    render(<FileImageChip file={FIXTURE_PDF} />);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('削除ボタンで削除を通知すること', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<FileImageChip file={FIXTURE_IMAGE} onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: 'CHAT.INPUT.REMOVE_FILE' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('FileChipDocument', () => {
  test('ファイル名と大文字の拡張子を表示すること', () => {
    render(<FileChipDocument name="議事録.final.docx" />);
    expect(screen.getByText('議事録.final.docx')).toBeInTheDocument();
    expect(screen.getByText('DOCX')).toBeInTheDocument();
  });
});
