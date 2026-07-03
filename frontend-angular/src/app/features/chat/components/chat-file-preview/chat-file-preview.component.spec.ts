import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateService } from '@ngx-translate/core';
import { ChatFilePreviewComponent } from './chat-file-preview.component';
import { FileAttachment } from '../../../../../types/chat/file-attachment.type';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockImageFile: FileAttachment = {
  id: 'file-1',
  name: 'test-image.png',
  type: 'image/png',
  size: 1024,
  url: 'http://example.com/image.png',
};

const mockPdfFile: FileAttachment = {
  id: 'file-2',
  name: 'document.pdf',
  type: 'application/pdf',
  size: 2048,
};

const mockVideoFile: FileAttachment = {
  id: 'file-3',
  name: 'video.mp4',
  type: 'video/mp4',
  size: 5000000,
};

describe('ChatFilePreviewComponent', () => {
  let fixture: ComponentFixture<ChatFilePreviewComponent>;
  let component: ChatFilePreviewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatFilePreviewComponent, NoopAnimationsModule],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(ChatFilePreviewComponent, {
        set: { imports: [CommonModule, FakeTranslatePipe, MatIconModule] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatFilePreviewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('files', []);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('formatFileSize(0)が"0 Bytes"を返すこと', () => {
      expect(component.formatFileSize(0)).toBe('0 Bytes');
    });

    test('formatFileSize(1024)が"1 KB"を返すこと', () => {
      expect(component.formatFileSize(1024)).toBe('1 KB');
    });

    test('formatFileSize(1048576)が"1 MB"を返すこと', () => {
      expect(component.formatFileSize(1048576)).toBe('1 MB');
    });

    test('isImage()が画像ファイルでtrueを返すこと', () => {
      expect(component.isImage(mockImageFile)).toBe(true);
    });

    test('isImage()がPDFファイルでfalseを返すこと', () => {
      expect(component.isImage(mockPdfFile)).toBe(false);
    });

    test('isPdf()がPDFファイルでtrueを返すこと', () => {
      expect(component.isPdf(mockPdfFile)).toBe(true);
    });

    test('isPdf()が画像ファイルでfalseを返すこと', () => {
      expect(component.isPdf(mockImageFile)).toBe(false);
    });

    test('getFileIcon()が画像ファイルで"image"を返すこと', () => {
      expect(component.getFileIcon(mockImageFile)).toBe('image');
    });

    test('getFileIcon()がPDFファイルで"picture_as_pdf"を返すこと', () => {
      expect(component.getFileIcon(mockPdfFile)).toBe('picture_as_pdf');
    });

    test('getFileIcon()が動画ファイルで"videocam"を返すこと', () => {
      expect(component.getFileIcon(mockVideoFile)).toBe('videocam');
    });

    test('getFileIcon()が不明なタイプで"attach_file"を返すこと', () => {
      const unknownFile: FileAttachment = {
        id: 'x',
        name: 'test.xyz',
        type: 'unknown/type',
        size: 0,
      };
      expect(component.getFileIcon(unknownFile)).toBe('attach_file');
    });
  });

  describe('DOM要素表示', () => {
    test('ファイルが空の場合、空状態が表示されること', () => {
      fixture.componentRef.setInput('files', []);
      fixture.detectChanges();

      const emptyState = fixture.debugElement.query(By.css('p.text-gray-500'));
      expect(emptyState).toBeTruthy();
    });

    test('ファイルがある場合、ファイルリストが表示されること', () => {
      fixture.componentRef.setInput('files', [mockImageFile]);
      fixture.detectChanges();

      const fileItems = fixture.debugElement.queryAll(
        By.css('div.border.border-gray-200.rounded-lg'),
      );
      expect(fileItems.length).toBe(1);
    });

    test('ファイルが複数ある場合、全件表示されること', () => {
      fixture.componentRef.setInput('files', [mockImageFile, mockPdfFile]);
      fixture.detectChanges();

      const fileItems = fixture.debugElement.queryAll(
        By.css('div.border.border-gray-200.rounded-lg'),
      );
      expect(fileItems.length).toBe(2);
    });

    test('ヘッダーが表示されること', () => {
      const header = fixture.debugElement.query(By.css('div.border-b.border-gray-200'));
      expect(header).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('handleCloseEvent()でhandleCloseイベントが発火すること', () => {
      const emitted: void[] = [];
      component.handleClose.subscribe(() => emitted.push(undefined));

      component.handleCloseEvent();

      expect(emitted.length).toBe(1);
    });

    test('handleDownloadEvent()でhandleDownloadイベントが対象ファイルで発火すること', () => {
      const emitted: FileAttachment[] = [];
      component.handleDownload.subscribe((v) => emitted.push(v));

      component.handleDownloadEvent(mockImageFile);

      expect(emitted).toEqual([mockImageFile]);
    });

    test('handleRemoveEvent()でhandleRemoveイベントが対象ファイルで発火すること', () => {
      const emitted: FileAttachment[] = [];
      component.handleRemove.subscribe((v) => emitted.push(v));

      component.handleRemoveEvent(mockPdfFile);

      expect(emitted).toEqual([mockPdfFile]);
    });

    test('閉じるボタンクリックでhandleCloseイベントが発火すること', () => {
      const emitted: void[] = [];
      component.handleClose.subscribe(() => emitted.push(undefined));

      const closeBtn = fixture.debugElement.query(
        By.css('button[aria-label="CHAT.FILE_PREVIEW.CLOSE"]'),
      );
      closeBtn.nativeElement.click();

      expect(emitted.length).toBe(1);
    });
  });
});
