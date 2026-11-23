import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { cx } from '@/components/shared/class-names';
import { Dialog } from '@/components/shared/dialog';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import type { PeriodChange, PeriodOption } from '@/components/shared/period-filter-utils';
import {
  downloadTrainingFile,
  useAddTrainingFiles,
  useDeleteTrainingFiles,
  useRenameTrainingFile,
  useTrainingDataFiles,
  useUpdateTrainingFile,
} from '@/hooks/use-training-data-detail';
import { useTrainingDataStore } from '@/store/training-data-store';
import type { TrainingDataApiItem, TrainingDataFile } from '@/types/training-data.types';
import { TrainingDataActionBar } from './training-data-action-bar';
import { TrainingDataAddModal } from './training-data-add-modal';
import { DEFAULT_CHUNK_SIZE_PRESET } from './training-data-chunk-size';
import { TrainingDataEditModal } from './training-data-edit-modal';
import { resolveFileUpdaters } from './training-data-files-helper';
import { applyLinkPrefix } from './training-data-link-prefix';
import { TrainingDataFilters } from './training-data-filters';
import { TrainingDataTable, type EditingNames } from './training-data-table';
import {
  validateAddRow,
  validateEditField,
  type AddFileField,
  type AddFileRow,
  type EditFileValues,
} from './training-data-validation';

/** 一覧のモバイルでの下の余白。固定の操作バーに隠れないよう、選択中は高くする（移植元のホストクラス） */
const PADDING_DEFAULT = 'pb-38';
const PADDING_SELECTED = 'pb-55';

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: '', label: 'LEARNING_DATA.ALL_PERIODS' },
  { value: 'today', label: 'COMMON.PERIOD_FILTER.TODAY' },
  { value: '7days', label: 'COMMON.PERIOD_FILTER.PAST_7_DAYS' },
  { value: '30days', label: 'COMMON.PERIOD_FILTER.PAST_30_DAYS' },
  { value: 'custom', label: 'COMMON.PERIOD_FILTER.SPECIFY_PERIOD' },
];

/** 移植元のダイアログの幅。ローカル接続とクラウド接続で指定の書き方が違う */
const DIALOG_WIDTHS = {
  LOCAL: {
    edit: 'min(800px, 90vw)',
    deleteOne: 'min(800px, 90vw)',
    deleteMany: 'min(550px, 90vw)',
  },
  SAAS_GLOBAL: {
    edit: 'min(800px, calc(100vw - 32px))',
    deleteOne: 'min(550px, calc(100vw - 32px))',
    deleteMany: 'min(550px, calc(100vw - 32px))',
  },
} as const;
const ADD_DIALOG_WIDTH = 'min(1200px, 90vw)';

function defaultEditValues(file?: TrainingDataFile): EditFileValues {
  return {
    displayName: file?.displayName || '',
    reference: file?.reference || '',
    chunkSize: file?.chunkSize || DEFAULT_CHUNK_SIZE_PRESET,
  };
}

function nameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

/** 編集ダイアログでファイルを選ぶ前の状態（取り消したときに戻す） */
interface BeforeFileSelection {
  editingFile: TrainingDataFile | null;
  displayName: string;
  reference: string;
}

/** 削除の確認待ち。`deselectAll` は選択をまとめて削除したときだけ true */
interface PendingDelete {
  ids: string[];
  deselectAll: boolean;
}

/** 取得前の一覧。毎回新しい配列を返すと、これに依存する計算が描画のたびにやり直しになる */
const NO_FILES: TrainingDataFile[] = [];

interface TrainingDataFilesViewProps {
  data: TrainingDataApiItem;
  /** 同期（ローカル接続のみ）。ページ全体を読み込み中にするため、ページ側で処理する */
  onSync: () => void;
}

/**
 * 移植元 `TrainingDataDetailLocalComponent`・`TrainingDataDetailCloudComponent`。
 * 2 つはほぼ同じ作りなので 1 つにまとめた。違いは接続の種類（`data.type`）で切り替える
 * （ローカルは案内と一括同期、クラウドはダウンロード）。
 */
export function TrainingDataFilesView({ data, onSync }: TrainingDataFilesViewProps) {
  const { t } = useTranslation();
  const indexId = data.id;
  const isLocal = data.type === 'LOCAL';
  const widths = DIALOG_WIDTHS[data.type];

  const { filesFilter: filter, updateFilesFilter } = useTrainingDataStore();
  const filesQuery = useTrainingDataFiles(indexId, filter, data);
  const addFiles = useAddTrainingFiles(indexId, data);
  const deleteFiles = useDeleteTrainingFiles(indexId, data);
  const updateFile = useUpdateTrainingFile(indexId, data);
  const renameFile = useRenameTrainingFile(indexId, data);

  // 更新者の欄は、クラウドは API が返す名前、ローカルは一覧を取るときにログイン ID から引いた名前
  const files = useMemo(
    () => resolveFileUpdaters(filesQuery.data?.data ?? NO_FILES),
    [filesQuery.data],
  );
  const total = filesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
  const from = (filter.pageIndex - 1) * filter.pageSize + 1;
  const to = Math.min(filter.pageIndex * filter.pageSize, total);
  // 移植元でも日本語の固定文字列（辞書にキーがない）
  const countDisplay = total === 0 ? '0件' : `${from}-${to}件 / ${total}件`;
  const isFilesLoading =
    filesQuery.isFetching || addFiles.isPending || deleteFiles.isPending || updateFile.isPending;

  const [selectedFiles, setSelectedFiles] = useState<TrainingDataFile[]>([]);
  const [isRenamingMode, setIsRenamingMode] = useState(false);
  const [editingNames, setEditingNames] = useState<EditingNames>({});
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  // 追加ダイアログ（PC）
  const rowKeyRef = useRef(0);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addRows, setAddRows] = useState<AddFileRow[]>([]);
  const [linkPrefix, setLinkPrefix] = useState('');
  const [isAddSubmitting, setIsAddSubmitting] = useState(false);
  // 追加・編集ダイアログの入力チェックの文言は、完了／保存を押してから出す
  const [submitted, setSubmitted] = useState(false);

  // 編集ダイアログ（行の編集。スマートフォンでは追加にも使う）
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<TrainingDataFile | null>(null);
  const [editValues, setEditValues] = useState<EditFileValues>(defaultEditValues());
  const [editFilePreview, setEditFilePreview] = useState<string | null>(null);
  const [editUploadFile, setEditUploadFile] = useState<File | null>(null);
  const [editPreviewFailed, setEditPreviewFailed] = useState(false);
  // ファイルを選ぶ前の入力。選んだファイルを取り消したときに、書き換えた欄を戻すために持つ
  const beforeFileSelectionRef = useRef<BeforeFileSelection | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  // 画像の読み込みが終わったとき、まだそのファイルが選ばれているかを確かめる
  const editUploadFileRef = useRef<File | null>(null);
  const changeEditUploadFile = (file: File | null) => {
    editUploadFileRef.current = file;
    setEditUploadFile(file);
  };

  // ---- 選択 ----

  const clearSelection = () => {
    setSelectedFiles([]);
    setIsRenamingMode(false);
    setEditingNames({});
  };

  const handleSelectAllChange = (checked: boolean) => {
    if (!checked) {
      clearSelection();
      return;
    }
    setSelectedFiles(files);
    if (isRenamingMode) {
      setEditingNames(
        Object.fromEntries(
          files.map((file) => [
            file.id,
            { displayName: file.displayName, reference: file.reference ?? '' },
          ]),
        ),
      );
    }
  };

  const handleToggleItemSelection = (item: TrainingDataFile, checked: boolean) => {
    const next = checked
      ? [...selectedFiles, item]
      : selectedFiles.filter((file) => file.id !== item.id);
    setSelectedFiles(next);

    if (isRenamingMode) {
      setEditingNames((edits) => {
        if (checked) {
          return {
            ...edits,
            [item.id]: { displayName: item.displayName, reference: item.reference ?? '' },
          };
        }
        const rest = { ...edits };
        delete rest[item.id];
        return rest;
      });
    }

    if (next.length === 0) {
      setIsRenamingMode(false);
      setEditingNames({});
    }
  };

  // ---- 名前の変更 ----

  const handleEditName = () => {
    if (selectedFiles.length === 0) return;
    setEditingNames(
      Object.fromEntries(
        selectedFiles.map((file) => [
          file.id,
          { displayName: file.displayName, reference: file.reference ?? '' },
        ]),
      ),
    );
    setIsRenamingMode(true);
  };

  const handleUpdateEditingValue = (
    id: string,
    field: 'displayName' | 'reference',
    value: string,
  ) => {
    setEditingNames((edits) =>
      edits[id] ? { ...edits, [id]: { ...edits[id], [field]: value } } : edits,
    );
  };

  const handleSaveRename = () => {
    for (const [fileId, values] of Object.entries(editingNames)) {
      const original = files.find((file) => file.id === fileId);
      if (!original) continue;
      const referenceChanged = (original.reference ?? '') !== values.reference;
      if (original.displayName !== values.displayName || referenceChanged) {
        renameFile.mutate({
          fileId,
          displayName: values.displayName,
          reference: referenceChanged ? values.reference : undefined,
        });
      }
    }
    setIsRenamingMode(false);
    setEditingNames({});
  };

  // ---- 追加（PC） ----

  const handleOpenAdd = () => {
    setAddRows([]);
    setLinkPrefix('');
    setSubmitted(false);
    setIsAddOpen(true);
  };

  const handleFilesSelected = (selected: File[]) => {
    const newRows = selected.map<AddFileRow>((file) => {
      const base = nameWithoutExtension(file.name);
      rowKeyRef.current += 1;
      return {
        key: `row-${rowKeyRef.current}`,
        file,
        displayName: base,
        reference: base,
        chunkSize: DEFAULT_CHUNK_SIZE_PRESET,
      };
    });
    // 移植元は選んだ順に先頭へ挿入する（すでにある行は後ろに下がる）
    setAddRows((rows) => [...newRows, ...rows]);
  };

  const handleAddRowChange = (index: number, field: AddFileField, value: string) => {
    setAddRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleApplyLinkPrefix = () => {
    setAddRows((rows) => applyLinkPrefix(rows, linkPrefix));
  };

  const isAddFilesValid =
    addRows.length > 0 &&
    addRows.every((row) =>
      (['displayName', 'reference', 'chunkSize'] as const).every(
        (field) => validateAddRow(row, field) === null,
      ),
    );

  const handleSubmitAdd = async () => {
    setSubmitted(true);
    if (!isAddFilesValid || isAddSubmitting) return;

    setIsAddSubmitting(true);
    try {
      await addFiles.mutateAsync(
        addRows.map((row) => ({
          file: row.file,
          displayName: row.displayName,
          reference: row.reference,
          chunkSize: row.chunkSize,
        })),
      );
      setIsAddOpen(false);
    } catch {
      // 失敗の通知は api-client の共通エラートーストが出す。入力を残してダイアログは開いたままにする
    } finally {
      setIsAddSubmitting(false);
    }
  };

  // ---- 編集（行の編集・スマートフォンの追加） ----

  const openEditDialog = (file: TrainingDataFile | null) => {
    setEditingFile(file);
    setEditFilePreview(file?.image ?? null);
    changeEditUploadFile(null);
    setEditPreviewFailed(false);
    beforeFileSelectionRef.current = null;
    setEditValues(defaultEditValues(file ?? undefined));
    setSubmitted(false);
    setIsEditOpen(true);
  };

  const handleEditFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isEditSubmitting) return;

    // 取り消したときに戻せるよう、最初にファイルを選ぶ前の入力を覚えておく
    if (!editUploadFile) {
      beforeFileSelectionRef.current = {
        editingFile,
        displayName: editValues.displayName,
        reference: editValues.reference,
      };
    }
    // 移植元は追加のときだけ選んだファイルを保持する（編集のときは保持せず、差し替えが送られない）。
    // 選んだファイルが画面にだけ反映されて送られないのは意図とずれるため、編集でも保持する
    changeEditUploadFile(file);
    setEditPreviewFailed(false);
    if (!editingFile) {
      setEditValues((values) => ({
        ...values,
        displayName: nameWithoutExtension(file.name),
        reference: file.name,
      }));
    } else {
      setEditingFile({ ...editingFile, reference: file.name });
      setEditValues((values) => ({ ...values, reference: file.name }));
    }

    if (file.type.startsWith('image/')) {
      // 読み込むまでは前のプレビュー（既存の学習データの画像）を出さない。読み込みが終わる前に
      // 別のファイルを選び直したり取り消したりしたときは、このファイルのプレビューを出さない
      setEditFilePreview(null);
      const reader = new FileReader();
      reader.onload = (loaded) => {
        if (editUploadFileRef.current !== file) return;
        setEditFilePreview(loaded.target?.result as string);
      };
      reader.onerror = () => {
        if (editUploadFileRef.current !== file) return;
        setEditPreviewFailed(true);
      };
      reader.readAsDataURL(file);
    } else {
      setEditFilePreview(null);
    }
  };

  // 選んだファイルを取り消す。プレビューと選んだファイルの両方を捨て、書き換えた欄を戻す（NAW-1409・NAW-1412）
  const handleRemoveEditUploadFile = () => {
    const before = beforeFileSelectionRef.current;
    if (!before || isEditSubmitting) return;

    beforeFileSelectionRef.current = null;
    changeEditUploadFile(null);
    setEditPreviewFailed(false);
    setEditingFile(before.editingFile);
    setEditFilePreview(before.editingFile?.image ?? null);
    // 編集は参照資料のリンクだけ、追加は表示名と参照資料のリンクを戻す
    setEditValues((values) =>
      before.editingFile
        ? { ...values, reference: before.reference }
        : { ...values, displayName: before.displayName, reference: before.reference },
    );
  };

  const isEditFormValid = (['displayName', 'reference', 'chunkSize'] as const).every(
    (field) => validateEditField(editValues, field) === null,
  );

  const handleSubmitEdit = async () => {
    setSubmitted(true);
    if (!isEditFormValid || isEditSubmitting) return;

    setIsEditSubmitting(true);
    try {
      if (editingFile) {
        await updateFile.mutateAsync({
          fileId: editingFile.id,
          data: {
            displayName: editValues.displayName,
            reference: editValues.reference,
            ...(editValues.chunkSize !== (editingFile.chunkSize || DEFAULT_CHUNK_SIZE_PRESET)
              ? { chunkSize: editValues.chunkSize }
              : {}),
          },
          currentFile: files.find((file) => file.id === editingFile.id),
          defaultChunkSize: DEFAULT_CHUNK_SIZE_PRESET,
          uploadFile: editUploadFile ?? undefined,
        });
      } else {
        await addFiles.mutateAsync([
          {
            file: editUploadFile ?? undefined,
            displayName: editValues.displayName,
            reference: editValues.reference,
            chunkSize: editValues.chunkSize,
          },
        ]);
      }
      setIsEditOpen(false);
    } catch {
      // 失敗の通知は api-client の共通エラートーストが出す。入力を残してダイアログは開いたままにする
    } finally {
      setIsEditSubmitting(false);
    }
  };

  // ---- 削除・学習設定・ダウンロード ----

  const handleDeleteConfirmClose = (result?: unknown) => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!result || !target) return;
    // 失敗の通知は api-client の共通エラートーストが出す
    deleteFiles.mutate(target.ids);
    if (target.deselectAll) clearSelection();
  };

  const handleDownload = (file: TrainingDataFile) => {
    // 失敗の通知は api-client の共通エラートーストが出す
    downloadTrainingFile(indexId, file).catch(() => undefined);
  };

  // ---- 絞り込み ----

  const handlePeriodChange = (change: PeriodChange) =>
    updateFilesFilter({ selectedPeriod: change.value, filterPeriodRange: change.range });

  const showSelectedPadding = selectedFiles.length > 0 && !isRenamingMode;

  return (
    <div
      className={cx(
        'term-main md:pb-0 flex flex-col h-full',
        showSelectedPadding ? PADDING_SELECTED : PADDING_DEFAULT,
      )}
    >
      {isLocal && (
        <div className="flex flex-col gap-2 p-4 rounded-xl bg-bg-secondary md:gap-2 md:p-6 md:text-label-x-large text-text-default">
          <div className="flex gap-1 items-start md:gap-2">
            <span className="shrink-0 h-5" aria-hidden="true">
              <SvgIcon name="lightbulb" className="icon-20 text-brand-primary" />
            </span>
            <p className="flex-1 min-w-0 text-label-large md:text-label-x-large font-medium">
              {t('LEARNING_DATA.LOCAL_INFO_TITLE')}
            </p>
          </div>
          <p className="text-body-small">{t('LEARNING_DATA.LOCAL_INFO_TEXT')}</p>
        </div>
      )}

      <TrainingDataActionBar
        selectedFiles={selectedFiles}
        isRenamingMode={isRenamingMode}
        showSync={isLocal}
        onSync={onSync}
        onAddData={handleOpenAdd}
        onAddDataSp={() => openEditDialog(null)}
        onDeselectAll={clearSelection}
        onDeleteSelected={() => {
          if (selectedFiles.length === 0) return;
          setPendingDelete({ ids: selectedFiles.map((file) => file.id), deselectAll: true });
        }}
        onEditName={handleEditName}
        onSaveRename={handleSaveRename}
      />

      <TrainingDataFilters
        query={filter.query ?? ''}
        periodOptions={PERIOD_OPTIONS}
        selectedPeriod={filter.selectedPeriod ?? null}
        filterPeriodRange={filter.filterPeriodRange ?? null}
        countDisplay={countDisplay}
        totalPages={totalPages}
        currentPage={filter.pageIndex}
        onSearchQuery={(query) => updateFilesFilter({ query })}
        onPeriodChange={handlePeriodChange}
        onPageChange={(pageIndex) => updateFilesFilter({ pageIndex })}
      />

      <div className="relative flex-1 min-h-40">
        {isFilesLoading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary/60"
            data-testid="training-data-files-loading"
          >
            <CircularLoading />
          </div>
        )}
        <TrainingDataTable
          files={files}
          selectedFiles={selectedFiles}
          isRenamingMode={isRenamingMode}
          editingNames={editingNames}
          showDownload={!isLocal}
          totalPages={totalPages}
          currentPage={filter.pageIndex}
          onSelectAllChange={handleSelectAllChange}
          onToggleItemSelection={handleToggleItemSelection}
          onUpdateEditingValue={handleUpdateEditingValue}
          onDownload={handleDownload}
          onEditLearningData={openEditDialog}
          onDeleteFile={(file) => setPendingDelete({ ids: [file.id], deselectAll: false })}
          onPageChange={(pageIndex) => updateFilesFilter({ pageIndex })}
        />
      </div>

      <Dialog
        open={isAddOpen}
        title={t('LEARNING_DATA.ADD_DATA_TITLE')}
        buttonAlign="right"
        showDefaultActions={false}
        dialogWidth={ADD_DIALOG_WIDTH}
        panelClass="dialog-xl"
        disableClose={isAddSubmitting}
        onClose={() => setIsAddOpen(false)}
        customActions={
          <div className="flex justify-center gap-3 w-full">
            <Button
              variant="outline"
              size="lg"
              intent="cancel"
              className="flex-1"
              fullWidth
              disabled={isAddSubmitting}
              dataTestid="training-data-add-cancel"
              onClick={() => setIsAddOpen(false)}
            >
              {t('COMMON.CANCEL')}
            </Button>
            <Button
              variant="solid"
              size="lg"
              className="flex-1"
              fullWidth
              disabled={!isAddFilesValid || isAddSubmitting}
              loading={isAddSubmitting}
              dataTestid="training-data-add-submit"
              onClick={() => void handleSubmitAdd()}
            >
              {t('COMMON.COMPLETE')}
            </Button>
          </div>
        }
      >
        <TrainingDataAddModal
          rows={addRows}
          linkPrefix={linkPrefix}
          submitted={submitted}
          onFilesSelected={handleFilesSelected}
          onRowChange={handleAddRowChange}
          onRemoveFile={(index) => setAddRows((rows) => rows.filter((_, i) => i !== index))}
          onLinkPrefixChange={setLinkPrefix}
          onApplyLinkPrefix={handleApplyLinkPrefix}
        />
      </Dialog>

      <Dialog
        open={isEditOpen}
        title={t(editingFile ? 'LEARNING_DATA.EDIT_DATA_TITLE' : 'LEARNING_DATA.ADD_DATA_TITLE')}
        buttonAlign="right"
        showDefaultActions={false}
        dialogWidth={widths.edit}
        disableClose={isEditSubmitting}
        onClose={() => setIsEditOpen(false)}
        customActions={
          <div className="flex justify-center gap-3 w-full">
            <Button
              variant="outline"
              size="lg"
              intent="cancel"
              className="flex-1"
              fullWidth
              disabled={isEditSubmitting}
              dataTestid="training-data-edit-cancel"
              onClick={() => setIsEditOpen(false)}
            >
              {t('COMMON.CANCEL')}
            </Button>
            <Button
              variant="solid"
              size="lg"
              className="flex-1"
              fullWidth
              loading={isEditSubmitting}
              disabled={isEditSubmitting}
              dataTestid="training-data-edit-submit"
              onClick={() => void handleSubmitEdit()}
            >
              {t(editingFile ? 'COMMON.SAVE' : 'COMMON.COMPLETE')}
            </Button>
          </div>
        }
      >
        <TrainingDataEditModal
          values={editValues}
          submitted={submitted}
          editingFile={editingFile}
          editFilePreview={editFilePreview}
          uploadFile={editUploadFile}
          previewLoadFailed={editPreviewFailed}
          fileLocked={isEditSubmitting}
          onChange={setEditValues}
          onEditFileChange={handleEditFileChange}
          onRemoveUploadFile={handleRemoveEditUploadFile}
        />
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        title={t('LEARNING_DATA.DELETE_DATA_CONFIRM_TITLE')}
        message={t('LEARNING_DATA.DELETE_CONFIRM_MESSAGE')}
        confirmText={t('COMMON.DELETE')}
        cancelText={t('COMMON.CANCEL')}
        showCancel
        showConfirm
        buttonAlign="center"
        confirmDanger
        confirmIcon="delete"
        confirmTestid="training-data-delete-confirm"
        cancelTestid="training-data-delete-cancel"
        dialogWidth={pendingDelete?.deselectAll ? widths.deleteMany : widths.deleteOne}
        onClose={handleDeleteConfirmClose}
      />
    </div>
  );
}
