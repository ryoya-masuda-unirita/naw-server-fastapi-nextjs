import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUpload } from './file-upload';

const FIXTURE_FILE = new File(['hello'], 'report.pdf', { type: 'application/pdf' });

describe('FileUpload', () => {
  describe('初期表示', () => {
    test('simple のときドロップの案内だけを表示すること', () => {
      render(<FileUpload />);
      expect(screen.getByText('CHAT.INPUT.DROP_FILES')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('full のときファイル選択・フォルダ選択のボタンを表示すること', () => {
      render(<FileUpload variant="full" />);
      expect(screen.getByText('FILE_UPLOAD.DROP_FILE_OR_FOLDER')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /COMMON\.SELECT_FILE/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /COMMON\.SELECT_FOLDER/ })).toBeInTheDocument();
    });

    test('フォルダ選択の input はフォルダを選べる属性を持つこと', () => {
      const { container } = render(<FileUpload id="upload" />);
      expect(container.querySelector('#upload')).toHaveAttribute('multiple');
      expect(container.querySelector('#upload-folder')).toHaveAttribute('webkitdirectory');
    });
  });

  describe('ファイルの受け取り', () => {
    test('ファイルをドロップすると受け取ったファイルを通知すること', () => {
      const onFilesSelected = vi.fn();
      const { container } = render(<FileUpload onFilesSelected={onFilesSelected} />);
      const zone = container.querySelector('.file-upload')!;

      fireEvent.dragOver(zone);
      expect(zone).toHaveAttribute('data-drag-over', 'true');
      fireEvent.drop(zone, { dataTransfer: { files: [FIXTURE_FILE] } });

      expect(onFilesSelected).toHaveBeenCalledWith([FIXTURE_FILE]);
      expect(zone).toHaveAttribute('data-drag-over', 'false');
    });

    test('ドラッグが外れるとドラッグ中の表示を戻すこと', () => {
      const { container } = render(<FileUpload />);
      const zone = container.querySelector('.file-upload')!;
      fireEvent.dragOver(zone);
      fireEvent.dragLeave(zone);
      expect(zone).toHaveAttribute('data-drag-over', 'false');
    });

    test('ファイル選択ボタンから選んだファイルを通知すること', async () => {
      const user = userEvent.setup();
      const onFilesSelected = vi.fn();
      const { container } = render(<FileUpload id="upload" variant="full" onFilesSelected={onFilesSelected} />);
      const input = container.querySelector<HTMLInputElement>('#upload')!;
      const clickSpy = vi.spyOn(input, 'click');

      await user.click(screen.getByRole('button', { name: /COMMON\.SELECT_FILE/ }));
      expect(clickSpy).toHaveBeenCalled();

      await user.upload(input, FIXTURE_FILE);
      expect(onFilesSelected).toHaveBeenCalledWith([FIXTURE_FILE]);
      // 同じファイルを選び直せるよう値を空に戻す
      expect(input.value).toBe('');
    });

    test('フォルダ選択ボタンでフォルダ用の input を開くこと', async () => {
      const user = userEvent.setup();
      const { container } = render(<FileUpload id="upload" variant="full" />);
      const folderInput = container.querySelector<HTMLInputElement>('#upload-folder')!;
      const clickSpy = vi.spyOn(folderInput, 'click');

      await user.click(screen.getByRole('button', { name: /COMMON\.SELECT_FOLDER/ }));
      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
