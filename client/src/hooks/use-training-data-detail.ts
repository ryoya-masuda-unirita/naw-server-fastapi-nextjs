import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  indexRowToApiItem,
  normalizeTrainingDataFileListBody,
  type FileRow,
  type IndexRow,
} from '@/components/features/admin/training-data/training-data-api-normalize';
import { toSplitLength } from '@/components/features/admin/training-data/training-data-chunk-size';
import {
  toFileListApiParams,
  triggerBlobDownload,
} from '@/components/features/admin/training-data/training-data-files-helper';
import type { CreateIndexPayload } from '@/components/features/admin/training-data/training-folder-form';
import { normalizeAdminUsersListBody } from '@/components/features/admin/users/admin-users-api-normalize';
import {
  addLocalFiles,
  deleteLocalFiles,
  listLocalFiles,
  syncLocalFolder,
  updateLocalFile,
} from '@/components/features/admin/training-data/local-training-api';
import {
  requireUserId,
  viaLocalServer,
} from '@/components/features/admin/training-data/local-server-call';
import { apiClient, type QueryParams } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { useAuthStore } from '@/store/auth-store';
import type { UserApiItem } from '@/types/admin/user.types';
import type { PagedResponse } from '@/types/api-response.type';
import type {
  TrainingDataApiItem,
  TrainingDataFile,
  TrainingDataFileApiResponse,
  TrainingDataFileFilter,
  TrainingFileUploadEntry,
} from '@/types/training-data.types';
import { TRAINING_DATA_QUERY_KEY, invalidateLearningFolders } from './use-training-data';
import { useAdminUsers } from './use-admin-users';

// 移植元 training-data の TrainingApiService（詳細・ファイル）と TrainingDataStore の詳細まわり。

/** 移植元 `syncFolder` が同期の前に置く待ち時間 */
export const SYNC_DELAY_MS = 3000;

/** 更新者の名前を引くために取るユーザー数（移植元 `loadFilterUsers`） */
const FILTER_USERS_PAGE_SIZE = 1000;

/** ファイルを更新・追加するときにクエリで送る項目（移植元 `UpdateFileDto`） */
interface FileDto {
  displayName?: string;
  reference?: string;
  /** 画面の値（プリセットのキーか数値）。送るときに `splitLength` の数値にする */
  splitLength?: string;
}

/** ローカルの学習先フォルダか。ローカルのファイル操作は、クラウドではなくフォルダの接続先へ送る */
type LocalFolder = TrainingDataApiItem & { type: 'LOCAL' };

function isLocalFolder(folder: TrainingDataApiItem | undefined): folder is LocalFolder {
  return folder?.type === 'LOCAL';
}

function detailKey(id: string) {
  return [TRAINING_DATA_QUERY_KEY, 'detail', id] as const;
}

function filesKeyPrefix(id: string) {
  return [TRAINING_DATA_QUERY_KEY, 'files', id] as const;
}

/** 移植元 `TrainingApiService.getById`。キャッシュせず、呼ぶたびにクラウドから取る */
export async function fetchTrainingFolder(id: string): Promise<TrainingDataApiItem> {
  return indexRowToApiItem(await apiClient.get<IndexRow>(API_PATHS.INDEXES.DETAIL(id)));
}

/** 移植元 `TrainingApiService.getById`。画面を開くたび・戻るたびに読み直す */
export function useTrainingDataDetail(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    refetchOnWindowFocus: false,
    queryFn: () => fetchTrainingFolder(id),
  });
}

/** 取得前のユーザー一覧。毎回新しい配列を返すと、これに依存する計算が描画のたびにやり直しになる */
const NO_USERS: UserApiItem[] = [];

/** 更新者の絞り込みと、一覧の更新者名の表示に使うユーザー（移植元 `loadFilterUsers`） */
export function useTrainingFilterUsers(): UserApiItem[] {
  const query = useAdminUsers({
    pageSize: FILTER_USERS_PAGE_SIZE,
    pageIndex: 1,
    sortField: 'name',
    sortOrder: 'asc',
  });
  return query.data?.data ?? NO_USERS;
}

/** 取得前・対象なしのときの空の対応。毎回新しい Map を返すと、これに依存する計算が描画のたびにやり直しになる */
const NO_NAMES: ReadonlyMap<string, string> = new Map();

/**
 * ローカルの学習先フォルダの更新者名（ログイン ID → 表示名）。
 * ローカル用サーバーは更新者名を持たないため、表示しているページの更新者のログイン ID だけでユーザーを引く
 * （テナントの全ユーザーを取ると、ユーザー数に比例して表示が遅くなる。移植元 NAW-1424）。
 */
export function useLocalUpdaterNames(
  folder: TrainingDataApiItem | undefined,
  files: TrainingDataFile[],
): ReadonlyMap<string, string> {
  const loginIds = isLocalFolder(folder)
    ? [...new Set(files.map((file) => file.userId).filter((id): id is string => !!id))].sort()
    : [];
  const query = useQuery({
    queryKey: [TRAINING_DATA_QUERY_KEY, 'local-updaters', loginIds],
    enabled: loginIds.length > 0,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ReadonlyMap<string, string>> => {
      const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.USERS.LIST, {
        // backend は searchText・role を必須にしているため、絞り込みなしでも空文字を送る
        params: { page: 0, size: loginIds.length, searchText: '', role: '', loginIds },
      });
      const users = normalizeAdminUsersListBody(raw, { pageIndex: 1, pageSize: loginIds.length });
      return new Map(users.data.map((user) => [user.userId, user.displayName]));
    },
  });
  return query.data ?? NO_NAMES;
}

/**
 * 移植元 `TrainingApiService.listFiles`。
 * 読み込み中も前の一覧を出したままにする（移植元は読み込み中に一覧を消さない）。
 */
export function useTrainingDataFiles(
  id: string,
  filter: TrainingDataFileFilter,
  currentUserId: string | undefined,
  folder?: TrainingDataApiItem,
) {
  return useQuery({
    // ローカルのフォルダは接続先が違うため、種類と接続先もキーに含める
    queryKey: [
      ...filesKeyPrefix(id),
      filter,
      currentUserId,
      folder?.type,
      folder?.localServerEndpointId,
    ],
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<TrainingDataFileApiResponse> => {
      if (isLocalFolder(folder)) return viaLocalServer(() => listLocalFiles(folder, filter));
      const raw = await apiClient.get<PagedResponse<FileRow>>(API_PATHS.INDEXES.FILES(id), {
        params: { ...toFileListApiParams(filter, currentUserId) } as QueryParams,
      });
      return normalizeTrainingDataFileListBody(raw);
    },
  });
}

/** 空文字と未指定は送らない。`splitLength` は API の数値にする（移植元 `buildFileDtoParams`） */
function toFileDtoParams(dto: FileDto, fileName?: string): QueryParams {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(dto)) {
    if (value === undefined || value === '') continue;
    const paramValue = key === 'splitLength' ? toSplitLength(String(value)) : String(value);
    if (paramValue !== undefined) params[key] = paramValue;
  }
  // 移植元の Spring は name を省略できるが、backend はファイルを付けるとき name を必須にしている
  if (fileName) params.name = fileName;
  return params;
}

function buildFileFormData(file: File): FormData {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

/** 移植元 `TrainingApiService.addFiles`。1 件ずつ順に送る（ファイルが無い行は空のファイルを送る） */
async function uploadFiles(indexId: string, entries: TrainingFileUploadEntry[]): Promise<void> {
  for (const entry of entries) {
    const file =
      entry.file ?? new File([], entry.displayName, { type: 'application/octet-stream' });
    await apiClient.post(API_PATHS.INDEXES.FILES(indexId), buildFileFormData(file), {
      params: toFileDtoParams(
        {
          displayName: entry.displayName,
          reference: entry.reference,
          splitLength: entry.chunkSize,
        },
        file.name,
      ),
    });
  }
}

async function patchFile(
  indexId: string,
  fileId: string,
  dto: FileDto,
  file?: File,
): Promise<void> {
  await apiClient.patch(
    API_PATHS.INDEXES.FILE(indexId, fileId),
    file ? buildFileFormData(file) : null,
    { params: toFileDtoParams(dto, file?.name) },
  );
}

/**
 * ファイル 1 件の更新。ローカルのフォルダはローカル用サーバーへ、それ以外はクラウドへ送る。
 * ローカルは学習の ON/OFF を受け付けないため、`FileDto` に無い項目は送らない。
 */
function usePatchFile(indexId: string, folder: TrainingDataApiItem | undefined) {
  const userId = useAuthStore((state) => state.user?.id);
  return (fileId: string, dto: FileDto, file?: File): Promise<void> =>
    isLocalFolder(folder)
      ? viaLocalServer(() => updateLocalFile(folder, fileId, dto, requireUserId(userId), file))
      : patchFile(indexId, fileId, dto, file);
}

/** 現在のファイル一覧の読み込み結果。どの条件の一覧でも同じ ID の行を書き換えられるよう、一覧ごとに持つ */
type FilesSnapshot = [readonly unknown[], TrainingDataFileApiResponse | undefined][];

/**
 * 一覧の行を先に書き換え、失敗したら元に戻す（移植元 `updateFileNames`）。
 * 書き換えた後に一覧は取り直さない。
 */
function useOptimisticFilePatch(indexId: string) {
  const queryClient = useQueryClient();
  const prefix = filesKeyPrefix(indexId);

  const apply = async (
    fileId: string,
    change: Partial<TrainingDataFile>,
  ): Promise<FilesSnapshot> => {
    // 取得中の古い応答が、書き換えた行を上書きしないようにする
    await queryClient.cancelQueries({ queryKey: prefix });
    const snapshot = queryClient.getQueriesData<TrainingDataFileApiResponse>({ queryKey: prefix });
    queryClient.setQueriesData<TrainingDataFileApiResponse>({ queryKey: prefix }, (current) =>
      current
        ? {
            ...current,
            data: current.data.map((row) => (row.id === fileId ? { ...row, ...change } : row)),
          }
        : current,
    );
    return snapshot;
  };

  const rollback = (snapshot: FilesSnapshot) => {
    for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
  };

  return { apply, rollback };
}

async function refetchFiles(queryClient: QueryClient, indexId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: filesKeyPrefix(indexId) });
}

/** 移植元 `TrainingDataStore.updateFolder`。保存後に詳細を読み直す。一覧は次に開いたとき読み直す */
export function useUpdateTrainingFolder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateIndexPayload) =>
      apiClient.patch(API_PATHS.INDEXES.DETAIL(id), payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey(id) });
      await queryClient.invalidateQueries({ queryKey: [TRAINING_DATA_QUERY_KEY, 'list'] });
      invalidateLearningFolders(queryClient);
    },
  });
}

/** 移植元 `TrainingDataStore.deleteFolder` */
export function useDeleteTrainingFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(API_PATHS.INDEXES.DETAIL(id)),
    onSuccess: () => {
      invalidateLearningFolders(queryClient);
      return queryClient.invalidateQueries({ queryKey: [TRAINING_DATA_QUERY_KEY, 'list'] });
    },
  });
}

/** 移植元 `TrainingDataStore.syncFolder`。3 秒待ってから同期し、詳細と一覧を読み直す */
export function useSyncTrainingFolder(id: string, folder?: TrainingDataApiItem) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  return useMutation({
    mutationFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS));
      if (isLocalFolder(folder)) {
        await viaLocalServer(() => syncLocalFolder(folder, requireUserId(userId)));
        return;
      }
      await apiClient.post(API_PATHS.INDEXES.SYNC(id), {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey(id) });
      await refetchFiles(queryClient, id);
    },
  });
}

/** 移植元 `TrainingDataStore.addFiles` */
export function useAddTrainingFiles(id: string, folder?: TrainingDataApiItem) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  return useMutation({
    mutationFn: (entries: TrainingFileUploadEntry[]) =>
      isLocalFolder(folder)
        ? viaLocalServer(() => addLocalFiles(folder, entries, requireUserId(userId)))
        : uploadFiles(id, entries),
    // 途中のファイルで失敗しても、登録できた分を一覧に出すため成否を問わず読み直す
    onSettled: () => refetchFiles(queryClient, id),
  });
}

/** 移植元 `TrainingDataStore.deleteFiles`。1 件ずつの削除を同時に送る */
export function useDeleteTrainingFiles(id: string, folder?: TrainingDataApiItem) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fileIds: string[]) => {
      if (isLocalFolder(folder)) {
        await viaLocalServer(() => deleteLocalFiles(folder, fileIds));
        return;
      }
      await Promise.all(
        fileIds.map((fileId) => apiClient.delete(API_PATHS.INDEXES.FILE(id, fileId))),
      );
    },
    // 一部だけ失敗しても、削除できた分を一覧から消すため成否を問わず読み直す
    onSettled: () => refetchFiles(queryClient, id),
  });
}

interface UpdateTrainingFileVariables {
  fileId: string;
  data: Partial<TrainingDataFile>;
  /** 更新前の行。チャンク分割が変わったときだけ `splitLength` を送るために使う */
  currentFile: TrainingDataFile | undefined;
  /** 既定のチャンク分割（行にチャンク分割が無いときの比較用） */
  defaultChunkSize: string;
  uploadFile?: File;
}

/** 移植元 `TrainingDataStore.updateFile`（編集ダイアログの保存）。保存後に一覧を読み直す */
export function useUpdateTrainingFile(id: string, folder?: TrainingDataApiItem) {
  const queryClient = useQueryClient();
  const patch = usePatchFile(id, folder);
  return useMutation({
    mutationFn: ({
      fileId,
      data,
      currentFile,
      defaultChunkSize,
      uploadFile,
    }: UpdateTrainingFileVariables) => {
      const chunkSizeChanged =
        data.chunkSize !== undefined &&
        data.chunkSize !== (currentFile?.chunkSize || defaultChunkSize);
      return patch(
        fileId,
        {
          displayName: data.displayName,
          reference: data.reference,
          ...(chunkSizeChanged ? { splitLength: data.chunkSize } : {}),
        },
        uploadFile,
      );
    },
    onSuccess: () => refetchFiles(queryClient, id),
  });
}

interface RenameTrainingFileVariables {
  fileId: string;
  displayName: string;
  reference?: string;
}

/** 移植元 `TrainingDataStore.updateFileNames`（一覧上の名前変更）。先に画面を書き換え、失敗したら戻す */
export function useRenameTrainingFile(id: string, folder?: TrainingDataApiItem) {
  const { apply, rollback } = useOptimisticFilePatch(id);
  const patch = usePatchFile(id, folder);
  return useMutation({
    mutationFn: ({ fileId, displayName, reference }: RenameTrainingFileVariables) =>
      patch(fileId, { displayName, ...(reference !== undefined ? { reference } : {}) }),
    onMutate: ({ fileId, displayName, reference }) =>
      apply(fileId, { displayName, ...(reference !== undefined ? { reference } : {}) }),
    onError: (_error, _variables, snapshot) => {
      if (snapshot) rollback(snapshot);
    },
  });
}

/** 移植元 `TrainingDataStore.downloadFile`。取得したファイルを表示名でダウンロードする */
export async function downloadTrainingFile(indexId: string, file: TrainingDataFile): Promise<void> {
  const blob = await apiClient.get<Blob>(API_PATHS.INDEXES.FILE(indexId, file.id), {
    responseType: 'blob',
  });
  triggerBlobDownload(blob, file.displayName);
}
