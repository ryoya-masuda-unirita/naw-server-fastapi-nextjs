import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewerService } from './viewer.service';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';

function buildApiClientMock() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  };
}

/** fire-and-forget な loadContent の完了を待つ */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('ViewerService', () => {
  let service: ViewerService;
  let api: ReturnType<typeof buildApiClientMock>;

  beforeEach(() => {
    api = buildApiClientMock();
    TestBed.configureTestingModule({
      providers: [ViewerService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(ViewerService);
  });

  describe('ライブラリストリーミング', () => {
    it('beginLibraryStream でタイトル・本文がクリアされフラグとルームIDが設定されること', () => {
      service.markdownContent.set('既存コンテンツ');
      service.streamingLibraryTitle.set('旧タイトル');

      service.beginLibraryStream('room-1');

      expect(service.isLibraryStreaming()).toBe(true);
      expect(service.streamingRoomId()).toBe('room-1');
      expect(service.streamingLibraryTitle()).toBe('');
      expect(service.markdownContent()).toBe('');
    });

    it('append 系メソッドで差分が累積されること', () => {
      const token = service.beginLibraryStream('room-1');

      service.appendLibraryTitleDelta(token, '会議');
      service.appendLibraryTitleDelta(token, 'メモ');
      service.appendLibraryContentDelta(token, '# 内容\n');
      service.appendLibraryContentDelta(token, '要点一覧');

      expect(service.streamingLibraryTitle()).toBe('会議メモ');
      expect(service.markdownContent()).toBe('# 内容\n要点一覧');
    });

    it('古いトークンの append は無視されること', () => {
      const oldToken = service.beginLibraryStream('room-1');
      const newToken = service.beginLibraryStream('room-1');

      service.appendLibraryContentDelta(newToken, '新しい本文');
      service.appendLibraryContentDelta(oldToken, '古い本文');
      service.appendLibraryTitleDelta(oldToken, '古いタイトル');

      expect(service.markdownContent()).toBe('新しい本文');
      expect(service.streamingLibraryTitle()).toBe('');
    });

    it('endLibraryStream でフラグが下がり roomId 指定時は一覧を再取得すること', async () => {
      api.get.mockResolvedValue({ data: [{ id: 'lib-1', title: '会議メモ' }] });
      const token = service.beginLibraryStream('room-1');

      await service.endLibraryStream(token, 'room-1');

      expect(service.isLibraryStreaming()).toBe(false);
      expect(service.streamingRoomId()).toBeNull();
      expect(api.get).toHaveBeenCalledWith(API_PATHS.VIEWER.DETAIL_LIST('room-1'));
      expect(service.viewers()).toEqual([{ id: 'lib-1', title: '会議メモ' }]);
    });

    it('endLibraryStream で再読込一覧からタイトル一致のライブラリが選択され、本文は再取得しないこと', async () => {
      api.get.mockResolvedValue({
        data: [
          { id: 'lib-1', title: '既存ライブラリ' },
          { id: 'lib-2', title: '会議メモ' },
        ],
      });
      const token = service.beginLibraryStream('room-1');
      service.appendLibraryTitleDelta(token, '会議メモ');
      service.appendLibraryContentDelta(token, 'ストリーム本文');

      await service.endLibraryStream(token, 'room-1');
      await flush();

      expect(service.activeLibrary()).toEqual({ id: 'lib-2', title: '会議メモ' });
      // 一覧の GET のみで本文の GET は発生しない（ストリーム済み内容を保持）
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(service.markdownContent()).toBe('ストリーム本文');
    });

    it('endLibraryStream でストリームタイトルの末尾改行を無視して照合できること', async () => {
      // サーバーは永続化時にタイトルを strip するが、ストリーム差分には CONTENT マーカー直前の改行が含まれる
      api.get.mockResolvedValue({ data: [{ id: 'lib-2', title: '会議メモ' }] });
      const token = service.beginLibraryStream('room-1');
      service.appendLibraryTitleDelta(token, '会議メモ');
      service.appendLibraryTitleDelta(token, '\n');

      await service.endLibraryStream(token, 'room-1');

      expect(service.activeLibrary()).toEqual({ id: 'lib-2', title: '会議メモ' });
    });

    it('endLibraryStream で roomId なしでもタイトル照合が実行されること', async () => {
      service.viewers.set([
        { id: 'lib-1', title: '既存ライブラリ' },
        { id: 'lib-2', title: '会議メモ' },
      ]);
      const token = service.beginLibraryStream('room-1');
      service.appendLibraryTitleDelta(token, '会議メモ');
      service.appendLibraryContentDelta(token, 'ストリーム本文');

      await service.endLibraryStream(token);

      // roomId なしでも viewers の現在値からタイトル照合して activeLibrary を設定する
      expect(service.activeLibrary()).toEqual({ id: 'lib-2', title: '会議メモ' });
      // 一覧の再取得は行わない
      expect(api.get).not.toHaveBeenCalled();
      expect(service.markdownContent()).toBe('ストリーム本文');
    });

    it('endLibraryStream でタイトル一致なし時は activeLibrary を変更しないこと', async () => {
      const existing = { id: 'lib-99', title: '選択済みライブラリ' };
      service.activeLibrary.set(existing);
      api.get.mockResolvedValue({ data: [{ id: 'lib-1', title: '別のライブラリ' }] });
      const token = service.beginLibraryStream('room-1');
      service.appendLibraryTitleDelta(token, '存在しないタイトル');

      await service.endLibraryStream(token, 'room-1');

      // タイトルが一致しない場合、activeLibrary はセンチネルに置き換えられず現状維持
      expect(service.activeLibrary()).toEqual(existing);
    });

    it('古いトークンの endLibraryStream は現行ストリームを終了させないこと', async () => {
      const oldToken = service.beginLibraryStream('room-1');
      service.beginLibraryStream('room-2');

      await service.endLibraryStream(oldToken, 'room-1');

      expect(service.isLibraryStreaming()).toBe(true);
      expect(service.streamingRoomId()).toBe('room-2');
      expect(api.get).not.toHaveBeenCalled();
    });

    it('abortLibraryStream で表示が解除され選択中ライブラリのサーバー内容へ復元されること', async () => {
      api.get.mockResolvedValue({ data: '復元されたコンテンツ', title: '復元タイトル' });
      service.activeLibrary.set({ id: 'lib-1', title: '既存ライブラリ' });
      const token = service.beginLibraryStream('room-1');
      service.appendLibraryContentDelta(token, '途中までの本文');

      await service.abortLibraryStream(token);

      expect(service.isLibraryStreaming()).toBe(false);
      expect(api.get).toHaveBeenCalledWith(API_PATHS.VIEWER.CONTENT('lib-1'));
      expect(service.markdownContent()).toBe('復元されたコンテンツ');
      expect(service.activeLibrary()).toEqual({ id: 'lib-1', title: '復元タイトル' });
    });

    it('abortLibraryStream で選択中ライブラリがない場合は本文をクリアすること', async () => {
      const token = service.beginLibraryStream('room-1');
      service.appendLibraryContentDelta(token, '途中までの本文');

      await service.abortLibraryStream(token);

      expect(api.get).not.toHaveBeenCalled();
      expect(service.markdownContent()).toBe('');
    });
  });

  describe('selectLibrary', () => {
    it('選択したライブラリの本文を取得して表示すること', async () => {
      api.get.mockResolvedValue({ data: '# ライブラリ本文', title: '会議メモ' });

      service.selectLibrary({ id: 'lib-1', title: '一覧のタイトル' });
      await flush();

      expect(api.get).toHaveBeenCalledWith(API_PATHS.VIEWER.CONTENT('lib-1'));
      expect(service.activeLibrary()).toEqual({ id: 'lib-1', title: '会議メモ' });
      expect(service.markdownContent()).toBe('# ライブラリ本文');
    });

    it('同じライブラリの再選択では本文を再取得しないこと', async () => {
      api.get.mockResolvedValue({ data: '# ライブラリ本文' });
      service.selectLibrary({ id: 'lib-1', title: '会議メモ' });
      await flush();

      service.selectLibrary({ id: 'lib-1', title: '会議メモ' });
      await flush();

      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('ストリーミング中の選択はストリームの表示所有権を剥奪すること', async () => {
      api.get.mockResolvedValue({ data: '選択したライブラリの本文', title: '既存ライブラリ' });
      const token = service.beginLibraryStream('room-1');
      service.appendLibraryContentDelta(token, 'ストリーム本文');

      service.selectLibrary({ id: 'lib-1', title: '既存ライブラリ' });
      await flush();

      expect(service.isLibraryStreaming()).toBe(false);
      expect(service.markdownContent()).toBe('選択したライブラリの本文');
      // 剥奪後はストリームの append/end が表示に影響しないこと
      service.appendLibraryContentDelta(token, 'ストリームの続き');
      await service.endLibraryStream(token, 'room-1');
      expect(service.markdownContent()).toBe('選択したライブラリの本文');
    });

    it('連続選択では後勝ちになること（遅い応答が新しい選択を上書きしない）', async () => {
      let resolveA: (value: unknown) => void = () => undefined;
      api.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      );
      api.get.mockResolvedValue({ data: 'ライブラリBの本文', title: 'B' });

      service.selectLibrary({ id: 'lib-a', title: 'A' });
      service.selectLibrary({ id: 'lib-b', title: 'B' });
      await flush();
      resolveA({ data: 'ライブラリAの本文', title: 'A' });
      await flush();

      expect(service.activeLibrary()).toEqual({ id: 'lib-b', title: 'B' });
      expect(service.markdownContent()).toBe('ライブラリBの本文');
    });
  });

  describe('showLibrary', () => {
    it('コンテンツ取得 API の title で activeLibrary を更新すること', async () => {
      api.get.mockResolvedValue({ data: '# 本文', title: 'APIタイトル' });

      await service.showLibrary({ id: 'lib-1', title: '' });

      expect(api.get).toHaveBeenCalledWith(API_PATHS.VIEWER.CONTENT('lib-1'));
      expect(service.activeLibrary()).toEqual({ id: 'lib-1', title: 'APIタイトル' });
      expect(service.viewers()).toEqual([{ id: 'lib-1', title: 'APIタイトル' }]);
      expect(service.markdownContent()).toBe('# 本文');
    });
  });

  describe('loadList', () => {
    it('一覧を取得し、未選択時は最新（末尾）のライブラリを自動選択して本文を取得すること', async () => {
      api.get.mockImplementation((url: string) =>
        url === API_PATHS.VIEWER.DETAIL_LIST('room-1')
          ? Promise.resolve({
              data: [
                { id: 'lib-1', title: '古いライブラリ' },
                { id: 'lib-2', title: '最新ライブラリ' },
              ],
            })
          : Promise.resolve({ data: '最新ライブラリの本文', title: '最新ライブラリ' }),
      );

      await service.loadList('room-1');
      await flush();

      expect(service.activeLibrary()).toEqual({ id: 'lib-2', title: '最新ライブラリ' });
      expect(api.get).toHaveBeenCalledWith(API_PATHS.VIEWER.CONTENT('lib-2'));
      expect(service.markdownContent()).toBe('最新ライブラリの本文');
    });

    it('選択中ライブラリが一覧に残っている場合は選択も本文も維持すること', async () => {
      service.activeLibrary.set({ id: 'lib-1', title: '古いライブラリ' });
      service.markdownContent.set('表示中の本文');
      api.get.mockResolvedValue({
        data: [
          { id: 'lib-1', title: '古いライブラリ' },
          { id: 'lib-2', title: '最新ライブラリ' },
        ],
      });

      await service.loadList('room-1');
      await flush();

      expect(service.activeLibrary()).toEqual({ id: 'lib-1', title: '古いライブラリ' });
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(service.markdownContent()).toBe('表示中の本文');
    });

    it('選択中ライブラリが一覧に存在しない場合（ルーム切替）は最新を選び直すこと', async () => {
      service.activeLibrary.set({ id: 'old-room-lib', title: '別ルームのライブラリ' });
      api.get.mockImplementation((url: string) =>
        url === API_PATHS.VIEWER.DETAIL_LIST('room-2')
          ? Promise.resolve({ data: [{ id: 'lib-9', title: 'ルーム2のライブラリ' }] })
          : Promise.resolve({ data: 'ルーム2の本文', title: 'ルーム2のライブラリ' }),
      );

      await service.loadList('room-2');
      await flush();

      expect(service.activeLibrary()).toEqual({ id: 'lib-9', title: 'ルーム2のライブラリ' });
      expect(service.markdownContent()).toBe('ルーム2の本文');
    });

    it('一覧取得完了後に listLoadedRoomId が更新されること', async () => {
      api.get.mockResolvedValue({ data: [{ id: 'lib-1', title: '会議メモ' }] });

      expect(service.hasListLoadedFor('room-1')).toBe(false);
      await service.loadList('room-1');

      expect(service.listLoadedRoomId()).toBe('room-1');
      expect(service.hasListLoadedFor('room-1')).toBe(true);
      expect(service.hasListLoadedFor('room-2')).toBe(false);
    });

    it('一覧が空の場合は選択を解除し本文をクリアすること', async () => {
      service.activeLibrary.set({ id: 'lib-1', title: '古いライブラリ' });
      service.markdownContent.set('表示中の本文');
      api.get.mockResolvedValue({ data: [] });

      await service.loadList('room-1');

      expect(service.activeLibrary()).toBeNull();
      expect(service.markdownContent()).toBe('');
      expect(service.listLoadError()).toBe(false);
    });

    it('一覧取得に失敗した場合は listLoadError を true にすること', async () => {
      api.get.mockRejectedValue(new Error('Forbidden'));

      await service.loadList('room-1');

      expect(service.viewers()).toEqual([]);
      expect(service.listLoadError()).toBe(true);
    });

    it('autoSelect: false では自動選択しないこと', async () => {
      api.get.mockResolvedValue({ data: [{ id: 'lib-1', title: '会議メモ' }] });

      await service.loadList('room-1', { autoSelect: false });
      await flush();

      expect(service.activeLibrary()).toBeNull();
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('同一ルームのストリーミング中は自動選択せずストリーム本文を保持すること', async () => {
      const token = service.beginLibraryStream('room-1');
      service.appendLibraryContentDelta(token, 'ストリーム本文');
      api.get.mockResolvedValue({ data: [{ id: 'lib-1', title: '会議メモ' }] });

      await service.loadList('room-1');
      await flush();

      expect(service.isLibraryStreaming()).toBe(true);
      expect(service.activeLibrary()).toBeNull();
      expect(service.markdownContent()).toBe('ストリーム本文');
    });

    it('別ルームの一覧読込はストリームの表示所有権を剥奪すること', async () => {
      const token = service.beginLibraryStream('room-A');
      api.get.mockImplementation((url: string) =>
        url === API_PATHS.VIEWER.DETAIL_LIST('room-B')
          ? Promise.resolve({ data: [{ id: 'lib-b', title: 'ルームBのライブラリ' }] })
          : Promise.resolve({ data: 'ルームBの本文', title: 'ルームBのライブラリ' }),
      );

      await service.loadList('room-B');
      await flush();

      expect(service.isLibraryStreaming()).toBe(false);
      expect(service.markdownContent()).toBe('ルームBの本文');
      // 剥奪後はルームAのストリームの append が表示に影響しないこと
      service.appendLibraryContentDelta(token, 'ルームAの続き');
      expect(service.markdownContent()).toBe('ルームBの本文');
    });

    it('連続ルーム切替時は古い一覧応答を破棄すること', async () => {
      let resolveA: (value: unknown) => void = () => undefined;
      api.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      );
      api.get.mockImplementation((url: string) =>
        url === API_PATHS.VIEWER.DETAIL_LIST('room-B')
          ? Promise.resolve({ data: [{ id: 'lib-b', title: 'ルームBのライブラリ' }] })
          : Promise.resolve({ data: 'ルームBの本文', title: 'ルームBのライブラリ' }),
      );

      const loadingA = service.loadList('room-A');
      const loadingB = service.loadList('room-B');
      await loadingB;
      resolveA({ data: [{ id: 'lib-a', title: 'ルームAのライブラリ' }] });
      await loadingA;
      await flush();

      expect(service.viewers()).toEqual([{ id: 'lib-b', title: 'ルームBのライブラリ' }]);
      expect(service.activeLibrary()).toEqual({ id: 'lib-b', title: 'ルームBのライブラリ' });
    });
  });
});
