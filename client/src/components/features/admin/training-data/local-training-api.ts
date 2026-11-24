import { apiClient, type ApiRequestOptions, type QueryParams } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { PagedResponse } from '@/types/api-response.type';
import type {
  AdditionalLearningTarget,
  LocalServerEndpoint,
  TrainingDataApiItem,
  TrainingDataFileApiResponse,
  TrainingDataFileFilter,
  TrainingFileUploadEntry,
} from '@/types/training-data.types';
import { normalizeTrainingDataFileListBody, type FileRow } from './training-data-api-normalize';
import { toSplitLength } from './training-data-chunk-size';
import {
  buildLocalServerUrl,
  toLocalFileListParams,
  toLocalFormData,
} from './local-training-api-helper';

// 移植元 training-data/services/local-training-api.service.ts
//
// ローカルの学習先フォルダのファイルはローカル用サーバーが持つ。クラウドの API サーバーはローカルのフォルダの
// ファイル操作を断るため、フォルダの接続先（LOCAL_SERVER）の URL に直接送る。
// ローカル用サーバーは Waha! のジョブで学習するため、フォルダに登録したサービス名も一緒に送る。

/** ローカル用サーバーの API キーを送るヘッダー */
const LOCAL_SERVER_AUTH_HEADER = 'X-Server-Auth-Key';

/** ローカルのファイルを更新するときに送る項目（移植元 `UpdateFileDto`） */
export interface LocalFileUpdate {
  displayName?: string;
  reference?: string;
  /** 画面の値（プリセットのキーか数値）。送るときに `splitLength` の数値にする */
  splitLength?: string;
}

/** 接続先の URL と、ローカル用サーバーへ付ける認証ヘッダー */
interface LocalServerTarget {
  url: (path: string) => string;
  options: ApiRequestOptions;
}

/**
 * フォルダの接続先（URL と API キー）を、操作のたびにクラウドの API から取る。
 * 取り置かないのは、接続先を変えた直後に古い値で送らないため。
 * 取れないときは、クラウドにもローカル用サーバーにも送らず失敗させる。
 */
async function resolveLocalServer(folder: TrainingDataApiItem): Promise<LocalServerTarget> {
  const endpointId = folder.localServerEndpointId;
  if (!endpointId) {
    throw new Error('ローカルの学習先フォルダに接続先が登録されていません');
  }
  const server = await apiClient.get<Partial<LocalServerEndpoint>>(
    API_PATHS.LOCAL_SERVER.ENDPOINT(endpointId),
  );
  if (!server.endpoint || !server.apiKey) {
    throw new Error('ローカル用サーバーの URL または API キーを取得できませんでした');
  }
  const { endpoint, apiKey } = server;
  return {
    url: (path) => buildLocalServerUrl(endpoint, path),
    options: {
      headers: { [LOCAL_SERVER_AUTH_HEADER]: apiKey },
      // ローカル用サーバーの 401（API キーの誤りなど）で、クラウドのログインを切らない
      skipSessionInvalidation: true,
    },
  };
}

/** 移植元 `LocalTrainingApiService.listFiles` */
export async function listLocalFiles(
  folder: TrainingDataApiItem,
  filter: TrainingDataFileFilter,
): Promise<TrainingDataFileApiResponse> {
  const server = await resolveLocalServer(folder);
  const raw = await apiClient.get<PagedResponse<FileRow>>(
    server.url(API_PATHS.LOCAL_SERVER.FILES(folder.id)),
    { ...server.options, params: { ...toLocalFileListParams(filter) } as QueryParams },
  );
  return normalizeTrainingDataFileListBody(raw);
}

/** 移植元 `LocalTrainingApiService.addFiles`。1 件ずつ順に送る（ファイルが無い行は空のファイルを送る） */
export async function addLocalFiles(
  folder: TrainingDataApiItem,
  entries: TrainingFileUploadEntry[],
  userId: string,
): Promise<void> {
  const server = await resolveLocalServer(folder);
  for (const entry of entries) {
    const file =
      entry.file ?? new File([], entry.displayName, { type: 'application/octet-stream' });
    await apiClient.post(
      server.url(API_PATHS.LOCAL_SERVER.FILES(folder.id)),
      toLocalFormData({
        file,
        name: file.name,
        displayName: entry.displayName,
        reference: entry.reference,
        splitLength: toSplitLength(entry.chunkSize),
        userId,
        creationServiceName: folder.add,
      }),
      server.options,
    );
  }
}

/**
 * 移植元 `LocalTrainingApiService.updateFile`。
 * ローカル用サーバーは、ファイルが付いていれば作り直し（削除してから追加）、無ければ表示名と参照のリンクだけを変える。
 * 学習の ON / OFF（status）は受け付けない。
 */
export async function updateLocalFile(
  folder: TrainingDataApiItem,
  fileId: string,
  dto: LocalFileUpdate,
  userId: string,
  file?: File,
): Promise<void> {
  const server = await resolveLocalServer(folder);
  await apiClient.patch(
    server.url(API_PATHS.LOCAL_SERVER.FILE(folder.id, fileId)),
    toLocalFormData({
      file,
      name: file?.name,
      displayName: dto.displayName,
      reference: dto.reference,
      splitLength: toSplitLength(dto.splitLength),
      userId,
      creationServiceName: folder.add,
      deletionServiceName: folder.delete,
    }),
    server.options,
  );
}

/**
 * 移植元 `LocalTrainingApiService.deleteFiles`。1 件ずつの削除を同時に送る。
 * ローカル用サーバーは物理削除で消す（論理削除の `false` を送ると、消したはずのファイルが残る）。
 *
 * 全件の結果が出そろってから返す。1 件が先に失敗しても、残りの削除の完了を待たずに返すと、
 * 呼び出し側が一覧を読み直した時点で、まだ削除中のファイルが残って見えるため。失敗があれば最初の失敗を投げる。
 */
export async function deleteLocalFiles(
  folder: TrainingDataApiItem,
  fileIds: string[],
): Promise<void> {
  const server = await resolveLocalServer(folder);
  const results = await Promise.allSettled(
    fileIds.map((fileId) =>
      apiClient.delete(server.url(API_PATHS.LOCAL_SERVER.FILE(folder.id, fileId)), {
        ...server.options,
        body: { deletionServiceName: folder.delete, physicalDelete: true },
      }),
    ),
  );
  const firstFailure = results.find((result) => result.status === 'rejected');
  if (firstFailure) throw firstFailure.reason;
}

/** 移植元 `LocalTrainingApiService.syncFolder` */
export async function syncLocalFolder(folder: TrainingDataApiItem, userId: string): Promise<void> {
  const server = await resolveLocalServer(folder);
  await apiClient.post(
    server.url(API_PATHS.LOCAL_SERVER.SYNC(folder.id)),
    { userId, syncServiceName: folder.get },
    server.options,
  );
}

/**
 * 移植元 `LocalTrainingApiService.addAdditionalLearning`。
 * 対象は `feedbackId` か `roomId` のどちらか一方だけ送る。
 */
export async function addLocalAdditionalLearning(
  folder: TrainingDataApiItem,
  target: AdditionalLearningTarget,
  userId: string,
  content: File,
): Promise<void> {
  const server = await resolveLocalServer(folder);
  await apiClient.post(
    server.url(API_PATHS.LOCAL_SERVER.ADDITIONAL_LEARNING(folder.id)),
    toLocalFormData({
      creationServiceName: folder.add,
      feedbackId: 'feedbackId' in target ? target.feedbackId : undefined,
      roomId: 'roomId' in target ? target.roomId : undefined,
      userId,
      content,
    }),
    server.options,
  );
}
