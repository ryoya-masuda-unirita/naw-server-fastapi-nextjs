import { afterEach, describe, expect, test, vi } from 'vitest';
import { printHtmlContent } from './print-html-content';

function createFakeWindow() {
  const documentElement = { innerHTML: '' };
  return {
    document: { documentElement },
    focus: vi.fn(),
    print: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('printHtmlContent', () => {
  test('.viewer-markdown の中身をタイトル付きで印刷ウィンドウに書き、少し待ってから印刷すること', () => {
    vi.useFakeTimers();
    const fakeWindow = createFakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow as unknown as Window);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<div class="viewer-markdown"><h1>見出し</h1></div>';

    printHtmlContent(wrapper, '資料');

    expect(fakeWindow.document.documentElement.innerHTML).toContain('<title>資料</title>');
    expect(fakeWindow.document.documentElement.innerHTML).toContain('<body><h1>見出し</h1></body>');
    expect(fakeWindow.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fakeWindow.print).toHaveBeenCalledTimes(1);
  });

  test('.viewer-markdown がなければ渡された要素の中身を印刷すること', () => {
    const fakeWindow = createFakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow as unknown as Window);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<p>本文</p>';

    printHtmlContent(wrapper, '資料');

    expect(fakeWindow.document.documentElement.innerHTML).toContain('<body><p>本文</p></body>');
  });

  test('タイトルの HTML はエスケープすること', () => {
    const fakeWindow = createFakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow as unknown as Window);

    printHtmlContent(document.createElement('div'), '<script>x</script>');

    expect(fakeWindow.document.documentElement.innerHTML).toContain(
      '<title>&lt;script&gt;x&lt;/script&gt;</title>',
    );
  });

  test('ウィンドウを開けなかったら何もしないこと', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    expect(() => printHtmlContent(document.createElement('div'), '資料')).not.toThrow();
  });
});
