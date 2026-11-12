# 共通 UI 部品（`src/components/shared/`）

移植元 `secuaigent/client` の `src/app/shared/components/*` と `core/services`（toast・confirm・dropdown）を React に移した部品です（Issue #278）。
画面を移植するときは、移植元のテンプレートにある `<app-xxx>` をここの部品に置き換えてください。見た目（Tailwind クラス・DOM 構造）と挙動は移植元に揃えてあります。

## 共通の約束事

### 移植元との対応

| 移植元（Angular） | React |
|---|---|
| `<app-xxx class="...">`（ホスト要素のクラス） | `className` prop。部品のルート要素に `app-xxx` クラスと一緒に付く |
| `model()` / `[(value)]` / ControlValueAccessor（`formControl`） | 制御コンポーネント: `value` + `onValueChange(value)` |
| `output()`（例: `selectionChange`） | `on` + PascalCase の prop（例: `onSelectionChange`） |
| `<ng-content>` | `children` |
| `TemplateRef` の input（例: `actionsTemplate`、`menuTpl`） | `ReactNode` または描画関数（例: `renderActions={(row) => ...}`） |
| `MatDialog.open(DialogComponent, { data })` | `<Dialog open={...} onClose={...} {...data} />` |
| `ToastService` | `useToastStore`（`toast-store.ts`） |
| `DropdownService` | `dropdownService`（`dropdown-service.ts`） |
| `UiStore.isMobile` | `useIsMobile()`（`use-is-mobile.ts`、幅 768px 未満をモバイル） |
| `src/types/common.ts` の `SelectOption`、`tab.type.ts` の `TabItem`、`table.interface.ts` | `types.ts` |

### 文言

`useTranslation()` の `t()` で翻訳します。props の `label`・`header`・`emptyMessage` などに「i18n キー」と書いてあるものはキーを渡します（部品の中で翻訳します）。
テストでは i18n を初期化しないので、`t()` はキーをそのまま返します（テストはキーで検証してください）。

### アイコン

- `MatIcon`（`mat-icon.tsx`）: 移植元テンプレートの `<mat-icon class="...">name</mat-icon>`。`material-symbols-outlined` フォントのリガチャで描画します
- `AppMatIcon`（`mat-icon.tsx`）: 移植元の `<app-mat-icon [icon]="...">`。外側の要素の font-size に合わせて 1em で描画します
- `SvgIcon`（`svg-icon.tsx`）: 移植元の `<app-svg-icon name="...">`。20x20 の SVG パス辞書（`svg-icon-paths.ts`、移植元からそのまま移したもの）から描画します

```tsx
<MatIcon icon="close" className="icon-20" />
<AppMatIcon icon="check" className="text-[22px]! text-brand-primary" />
<SvgIcon name="arrowDown" className="w-5 h-5 text-text-weak" />
```

### CSS の置き場所

- `src/index.css`: 移植元 `styles.css` をそのまま移したもの（色・文字サイズのトークン、`.dropdown-menu`・`.table-list-row`・`.icon-button`・`.combobox-*` などのグローバルなクラス）。中身は移植元と同じに保ちます
- `<部品名>.css`: 移植元の component SCSS。`:host` は部品のルート要素のクラス（`.app-<部品名>`）に置き換えてスコープしています
- `cdk-overlay.css`・`dialog.css`・`mat-icon.css`: 移植元が前提にしている Angular CDK / Material の基本スタイル。`index.css` 側の上書き（`.cdk-overlay-backdrop`、`.mdc-dialog__surface` など）がそのまま効くよう、同じクラス名で DOM を組んでいます
- `host-selectors.css`: 移植元 `styles.css` のうち要素セレクタ（`app-button.dialog-cancel-btn`、`app-checkbox:has(...)`）を使うルールのクラスセレクタ版

### アプリのルートに置くもの

移植元 `app.ts` と同じく、`src/main.tsx` に次の 2 つを 1 つずつ置いています。画面側で置く必要はありません。

- `<ToastContainer />`（トーストの表示先）
- `<DropdownBackdrop />`（`dropdownService` がモバイル幅で表示する暗幕）

### クラス結合

`class-names.ts` の `cx(...)` で、移植元の `[class.xxx]` / `[ngClass]` を 1 本の className にまとめています。

---

## ボタン・アイコンボタン

### Button

移植元: `shared/components/button`

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `children` | `ReactNode` | - | ボタンの文言 |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | |
| `variant` | `'solid' \| 'outline' \| 'text' \| 'danger'` | `'solid'` | |
| `size` | `'sm' \| 'md' \| 'lg' \| 'largePcDefault'` | `'md'` | `largePcDefault` は SP で 54px、PC で 36px |
| `intent` | `'default' \| 'cancel' \| 'delete'` | `'default'` | 色の意味（キャンセルはグレー、削除は赤） |
| `fullWidth` | `boolean` | `false` | |
| `disabled` / `loading` | `boolean` | `false` | loading 中はスピナーを出して押せない |
| `icon` | `ReactNode` | - | 移植元の `[icon]` スロット |
| `iconPosition` | `'left' \| 'right'` | `'right'` | |
| `heightPx` | `number` | - | 高さの上書き（例: 54） |
| `classProps` | `string` | `''` | 内部の `<button>` に足すクラス |
| `className` | `string` | - | ホスト要素（`span.app-button`）のクラス |
| `dataTestid` | `string` | - | 内部の `<button>` の data-testid |
| `onClick` | `(e) => void` | - | |

```tsx
<Button variant="outline" intent="cancel" size="largePcDefault" heightPx={54} onClick={close}>
  {t('COMMON.CANCEL')}
</Button>
<Button type="submit" fullWidth loading={isPending} iconPosition="left" icon={<MatIcon icon="login" className="h-5! w-5! text-[20px]!" />}>
  {t('AUTH.LOGIN.SUBMIT')}
</Button>
```

### IconButton

移植元: `shared/components/icon-button`。見た目は `index.css` の `.icon-button*`。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `children` | `ReactNode` | - | アイコン |
| `variant` | `'primary' \| 'secondary' \| 'tertiary' \| 'primary-gray' \| 'secondary-gray' \| 'tertiary-gray'` | `'primary'` | |
| `size` | `'default' \| 'thin' \| 'large' \| 'largePc'` | `'default'` | 28px / 20px / 36px / SP28・PC36px |
| `type` | `'button' \| 'submit' \| 'file' \| 'icon'` | `'button'` | `file` はファイル選択、`icon` はクリックできる div |
| `link` | `string` | `''` | 指定すると `<Link>` |
| `multiple` | `boolean` | `false` | `type="file"` の複数選択 |
| `disabled` / `ariaLabel` / `classProps` / `className` / `dataTestid` | | | |
| `onClick` | `(e) => void` | - | |
| `onFileChange` | `(files: FileList) => void` | - | `type="file"` で選ばれたとき |

```tsx
<IconButton variant="tertiary-gray" ariaLabel={t('COMMON.EDIT')} onClick={onEdit}>
  <SvgIcon name="edit" />
</IconButton>
```

## チェック・スイッチ

### Checkbox

移植元: `shared/components/checkbox`

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `checked` | `boolean` | `false` | |
| `indeterminate` | `boolean` | `false` | 中間状態。クリックすると `true` を通知する |
| `label` | `string` | `''` | i18n キー |
| `isHeader` | `boolean` | `false` | 全選択用（中間状態のアイコンが変わる） |
| `onCheckedChange` | `(checked: boolean) => void` | - | クリックで反転した値 |
| `className` | `string` | - | |

```tsx
<Checkbox checked={isAllSelected} indeterminate={hasSome && !isAllSelected} isHeader onCheckedChange={toggleAll} />
```

### Switch

移植元: `shared/components/switch`。クリックは親に伝えません（行クリックと両立させるため）。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `checked` | `boolean` | `false` | |
| `label` | `string` | `''` | 表示文言（翻訳しない。移植元と同じ） |
| `disabled` | `boolean` | `false` | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | |
| `showIcon` | `boolean` | `true` | つまみのアイコン |
| `onCheckedChange` | `(checked: boolean) => void` | - | |

```tsx
<Switch checked={enabled} onCheckedChange={setEnabled} />
```

## ダイアログ・通知

### Dialog

移植元: `shared/components/dialog`（`MatDialog.open(DialogComponent, { data, width, panelClass })` で開いていたもの）。
`document.body` 直下に Material と同じ DOM（`cdk-overlay-pane.mat-mdc-dialog-panel > mat-mdc-dialog-container > mdc-dialog__surface > .modal-dialog`）で描画します。
開いたら最初の操作可能な要素にフォーカスし、閉じたら元の要素に戻します。開いている間は背面をスクロールさせません。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `open` | `boolean` | - | 表示するか |
| `onClose` | `(result?: unknown) => void` | - | 閉じたいときに呼ばれる。確認ボタン=`true`、キャンセルボタン=`false`、×・Esc・背景クリック=`undefined`（移植元の `afterClosed()` の値） |
| `title` | `string` | - | |
| `titleClass` / `contentClass` | `string` | - | |
| `message` | `string` | - | 本文の前に出すメッセージ |
| `children` | `ReactNode` | - | 本文（移植元の `content` / `contentComponent`） |
| `showCancel` / `showConfirm` / `showClose` | `boolean` | `false` | |
| `cancelText` / `confirmText` | `string` | `'キャンセル'` / `'確認'` | 既定値は移植元どおりの日本語 |
| `buttonAlign` | `'center' \| 'right'` | 中央 | |
| `onCancel` / `onConfirm` | `() => void` | - | 指定するとボタンで閉じずにこれを呼ぶ（移植元の `cancelAction` / `confirmAction`） |
| `confirmDanger` | `boolean` | `false` | 確認ボタンを赤に |
| `confirmIcon` | `string` | - | `'delete'` は SVG、それ以外は material-symbols 名 |
| `confirmLoading` / `confirmDisabled` | `boolean` | `false` | |
| `confirmMinWidth` | `string` | `'min-w-30.5'` | |
| `leftActionText` / `leftActionIcon` / `leftActionDanger` / `leftActionLoading` / `onLeftAction` | | | 左下のボタン（無効化など） |
| `bottomLeftContent` | `ReactNode` | - | 左下に置く要素 |
| `headerTrailing` | `ReactNode` | - | タイトル右に置く要素 |
| `customActions` | `ReactNode` | - | 既定のボタン列の代わり |
| `showDefaultActions` | `boolean` | `true` | |
| `width` / `minWidth` | `string` | - | `.mdc-dialog__surface` の幅（移植元 `data.width`） |
| `dialogWidth` | `string` | - | パネルの幅（移植元 `dialog.open(..., { width })`） |
| `panelClass` | `string` | - | `dialog-xl`・`dialog-large`・`dialog-overflow-visible`・`delete-confirmation-dialog` など（`index.css` に定義あり） |
| `disableClose` | `boolean` | `false` | Esc・背景クリックで閉じない |
| `confirmTestid` / `cancelTestid` | `string` | `'dialog-confirm-button'` / `'dialog-cancel-button'` | |

移植元の `DialogData` のうち `showDivider`・`padding`・`borderRadius`・`confirmVariant` はテンプレートで使われていないので持っていません。

```tsx
const [open, setOpen] = useState(false);

<Dialog
  open={open}
  title={t('ADMIN.USER_MANAGEMENT.CREATE_NEW_USER')}
  confirmText={t('COMMON.CREATE')}
  cancelText={t('COMMON.CANCEL')}
  showCancel
  showConfirm
  buttonAlign="right"
  confirmMinWidth="min-w-24.5"
  dialogWidth="800px"
  confirmLoading={mutation.isPending}
  onConfirm={handleSubmit}
  onClose={() => setOpen(false)}
>
  <UserForm />
</Dialog>
```

削除確認:

```tsx
<Dialog
  open={deleting !== null}
  title={t('COMMON.DELETE_CONFIRM_TITLE')}
  message={t('COMMON.DELETE_CONFIRM_MESSAGE')}
  showCancel
  showConfirm
  confirmDanger
  confirmIcon="delete"
  confirmText={t('COMMON.DELETE')}
  onClose={(ok) => {
    if (ok) deleteMutation.mutate(deleting!.id);
    setDeleting(null);
  }}
/>
```

### Toast（`useToastStore` / `ToastContainer`）

移植元: `core/services/toast.service.ts`・`shared/components/toast-container`。右上に積んで表示し、時間が来たら消えます（success 3 秒・error 5 秒・warning 4 秒・info 3 秒。`0` 以下で自動では消えない）。
`ToastContainer` は `main.tsx` に置いてあるので、画面からは呼ぶだけです。

| 関数 | 説明 |
|---|---|
| `success(message, duration?)` / `error(...)` / `warning(...)` / `info(...)` | トーストを出す |
| `remove(id)` / `clear()` | 消す |

```tsx
const toast = useToastStore();
toast.success(t('ADMIN.USER_MANAGEMENT.CREATED'));

// コンポーネントの外（mutation の onError など）
useToastStore.getState().error(t('COMMON.ERROR'));
```

### Confirm（`useConfirmStore`）

移植元: `core/services/confirm.service.ts`。移植元でもこの状態を描画する UI はなく、どの画面からも使われていません（確認は `Dialog` で行っています）。移植元に揃えて状態（`dialog`・`isProcessing`）と操作（`confirm`・`handleConfirm`・`handleCancel`・`close`）だけを持ちます。

### dropdownService / DropdownBackdrop

移植元: `core/services/dropdown.service.ts`。開いているドロップダウンを 1 つに保ち、画面のどこかをクリックしたら閉じます。モバイル幅では `#dropdown-backdrop` の暗幕を出します。

```tsx
const [isOpen, setIsOpen] = useState(false);

const toggle = (event: React.MouseEvent) => {
  event.stopPropagation(); // document の click で直後に閉じないようにする
  if (isOpen) {
    setIsOpen(false);
    dropdownService.notifyClosed();
  } else {
    setIsOpen(true);
    dropdownService.open(() => setIsOpen(false));
  }
};
```

## 一覧・ページ

### Table

移植元: `shared/components/table`。モバイル（`md` 未満）は `.table-list-row` のカード、デスクトップは列のある表で表示します（両方を描画して CSS で出し分け）。選択はデータが変わるとクリアされます。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `data` | `T[]` | `[]` | 行。`id` があれば key に使う |
| `columns` | `TableColumn<T>[]` | `[]` | `field`（`'group.name'` のようなドット区切り可）、`header`（i18n キー）、`width`（Tailwind の幅クラス。省略で flex-1）、`sortable`、`render(row)`、`align`、`hasBorder` |
| `selectable` | `boolean` | `false` | チェックボックスで選択 |
| `sortable` | `boolean` | `false` | 見出しクリックで 昇順 → 降順 → 解除 |
| `isLoading` | `boolean` | `false` | |
| `emptyMessage` | `string` | `'COMMON.NO_DATA'` | i18n キー |
| `renderActions` | `(row) => ReactNode` | - | 行末の操作（移植元 `actionsTemplate`） |
| `renderMobileRow` | `(row) => ReactNode` | - | モバイル行の中身（移植元 `mobileRowTemplate`） |
| `actionsWidth` / `selectionWidth` | `string` | `'w-25'` / `'w-6'` | |
| `selectedClass` / `hoverClass` | `string` | `'bg-secondary'` / `'hover:bg-bg-brand-weak'` | |
| `rowTestid` | `string` | - | デスクトップ行の data-testid |
| `onSortChange` | `(sort: SortEvent) => void` | - | |
| `onSelectionChange` | `(rows: T[]) => void` | - | |
| `onRowClick` | `(row: T) => void` | - | |

```tsx
const columns: TableColumn<User>[] = [
  { field: 'name', header: 'ADMIN.USER_MANAGEMENT.NAME', sortable: true },
  { field: 'group.name', header: 'ADMIN.USER_MANAGEMENT.GROUP', width: 'w-40' },
  { field: 'status', header: 'ADMIN.USER_MANAGEMENT.STATUS', render: (u) => <StatusBadge user={u} /> },
];

<Table
  data={users}
  columns={columns}
  sortable
  selectable
  renderActions={(u) => <UserMenu user={u} />}
  onSortChange={setSort}
  onSelectionChange={setSelected}
/>
```

### TableList / TableListItem

移植元: `shared/components/table-list`。一覧の外枠と行。見た目は `index.css` の `.table-list*`。

`TableListItem` の props:

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `children` | `ReactNode` | - | 行の中身（`.table-list-row-content`） |
| `actions` | `ReactNode` | - | 右端（移植元の `slot="right"`、`.table-list-actions`） |
| `isHeader` | `boolean` | `false` | 見出し行 |
| `showCheckbox` / `checked` / `indeterminate` | `boolean` | `false` | チェックボックス付きのデータ行は行クリックでも切り替わる |
| `hasActions` | `boolean` | `true` | false で `.table-list-actions` を出さない |
| `dataTestid` / `className` | `string` | - | |
| `onCheckedChange` | `(checked: boolean) => void` | - | |

```tsx
<TableList>
  <TableListItem isHeader showCheckbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll}>
    <span className="table-list-date">{t('LIBRARY.NAME')}</span>
  </TableListItem>
  {items.map((item) => (
    <TableListItem
      key={item.id}
      showCheckbox
      checked={selected.has(item.id)}
      onCheckedChange={() => toggle(item.id)}
      actions={<ContextMenu menu={...} />}
    >
      {item.name}
    </TableListItem>
  ))}
</TableList>
```

### Pagination

移植元: `shared/components/pagination`。既定ではページと件数を URL のクエリ（`page`・`pageSize`）で持ち、他のクエリは残します（`queryParamsHandling: 'merge'` と同じ）。件数を変えると 1 ページ目に戻します。`useSearchParams` を使うので Router の中に置いてください。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `totalPages` | `number` | - | |
| `maxVisiblePages` | `number` | `5` | |
| `pageSizeOptions` | `number[]` | `[10, 20, 50]` | |
| `showPageSize` / `showPageSizeLabel` / `showPageNumbers` / `showFirstLast` | `boolean` | `true` | |
| `countDisplay` | `string` | `''` | 件数表示 |
| `useQueryParams` | `boolean` | `true` | false なら下の 2 つで現在値を渡す |
| `currentPageOverride` / `pageSizeOverride` | `number \| null` | `null` | |
| `pageParamName` / `pageSizeParamName` | `string` | `'page'` / `'pageSize'` | |
| `defaultPageSize` | `number` | `10` | |
| `onPageChange` / `onPageSizeChange` | `(n: number) => void` | - | |

```tsx
<Pagination totalPages={data.totalPages} countDisplay={`${from}-${to} / ${data.totalElements}`} />
```

### Tab

移植元: `shared/components/tab`。`activeTabId` がなければ先頭のタブ（無効でなければ）を選択中にします。`route` を持つタブは `<Link>` になります。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `tabs` | `TabItem[]` | - | `id`・`label`（i18n キー）・`icon`・`disabled`・`route` |
| `activeTabId` | `string` | `''` | |
| `fullWidth` | `boolean` | `false` | 均等幅 |
| `containerClass` / `className` | `string` | - | |
| `onTabChange` | `(tab: TabItem) => void` | - | |

```tsx
<Tab tabs={[{ id: 'assistant', label: 'ADMIN.ASSISTANT.TAB' }, { id: 'category', label: 'ADMIN.CATEGORY.TAB' }]} activeTabId={tab} onTabChange={(t) => setTab(t.id)} />
```

### PageHeader

移植元: `shared/components/page-header`。サイドバーの開閉は `useUiStore().toggleMobileSidebar`、戻るは `navigate(-1)`、言語切替は `i18n.changeLanguage` + `localStorage('language')` です。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `title` | `string` | - | |
| `titleKey` | `string` | - | 指定すると翻訳して title の代わりに出す |
| `showBackButton` | `boolean` | `true` | `lg` 未満で出る戻るボタン |
| `showSidebarToggle` | `boolean` | `true` | `md` 未満で出るサイドバー開閉 |
| `showBackButtonInMobile` | `boolean` | `false` | `onBackClick` を呼ぶ戻るボタン |
| `showActions` / `showShareButton` / `showLikeButton` | `boolean` | `true` | |
| `settingsIcon` | `'tune' \| 'more_vert' \| 'edit'` | `'tune'` | `more_vert` は名前変更・ビューア・共有・評価のメニュー |
| `showSettingsMobileOnly` | `boolean` | `false` | |
| `showTitleEdit` | `boolean` | `false` | タイトル横の編集ボタン |
| `showLanguageToggle` / `showLanguageToggleInMobile` | `boolean` | `true` / `false` | 両方 true のときだけ言語切替を出す（移植元と同じ） |
| `tabs` / `activeTabId` | | - | 下にタブを出す |
| `sticky` | `boolean` | `true` | |
| `actions` | `ReactNode` | - | 右側の末尾（移植元の `[pageHeaderActions]` スロット） |
| `onBackClick` / `onShareClick` / `onLikeClick` / `onSettingsClick` / `onRenameClick` / `onTabChange` | | - | |

```tsx
<PageHeader
  title={t('ADMIN.USER_MANAGEMENT.TITLE')}
  showActions={false}
  actions={<Button onClick={openCreate}>{t('COMMON.CREATE')}</Button>}
/>
```

### ContextMenu

移植元: `shared/components/context-menu`。デスクトップはトリガーにつながるドロップダウン（CDK の connected overlay と同じく、候補位置を順に試して画面に収まる位置に出す）、モバイルは下からのドロワーです。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `menu` | `ReactNode \| ({ close }) => ReactNode` | - | メニューの中身（移植元 `menuTpl`）。モバイルのドロワーは中身のクリックで閉じないので、項目から閉じるときは関数で受け取った `close` を呼ぶ（移植元の `contextMenu.close()`） |
| `customTrigger` | `ReactNode` | - | 既定のトリガーボタンの代わり |
| `triggerIcon` | `string` | - | material-symbols 名。省略すると歯車の SVG |
| `triggerTestid` | `string` | - | |
| `menuMinWidth` | `string` | `'min-w-60'` | |
| `panelClass` | `string` | `'bg-bg-primary flex flex-col gap-1 p-4 rounded-lg shadow-default text-xs font-medium'` | `'dropdown-menu dropdown-menu--bordered w-70'` なども可 |
| `closeOnContentClick` | `boolean` | `true` | デスクトップで中身をクリックしたら閉じる |
| `overlayPositions` | `ConnectedPosition[]` | 右下 → 右上 | |
| `hasPaddingButton` | `boolean` | `true` | |
| `ref` | `Ref<ContextMenuHandle>` | - | `open()`・`close()`・`toggle()`（移植元の `@ViewChild(ContextMenuComponent)`） |

```tsx
<ContextMenu
  triggerIcon="more_vert"
  triggerTestid="admin-users-menu"
  menu={({ close }) => (
    <>
      <button type="button" className="flex items-center gap-2 h-9 px-2 py-1 rounded-lg hover:bg-bg-secondary w-full text-left" onClick={() => { onEdit(); close(); }}>
        <AppMatIcon icon="edit" className="text-xl!" />
        {t('COMMON.EDIT')}
      </button>
    </>
  )}
/>
```

---

## 選択系（Select ほか）

共通の約束:

- 値は制御コンポーネントとして `value` + `onValueChange` で受け渡す。移植元の `model()` と同じく、親が `value` を更新しなくても部品の中で選んだ値は表示に残る（`[value]` + `(selectionChange)` だけの使い方も移植元どおり動く）。
- 移植元で `<app-xxx class="...">` とホスト要素に付けていたクラスは `className` に渡す。
- 画面幅 768px 未満（`useIsMobile()`）ではボトムドロワーで開く。
- 選択肢の型は `types.ts` の `SelectOption<T>`（`label`・`value`・`disabled?`・`description?`・`category?`）。
- 補助フックは `select-hooks.ts`（`useModelState`・`useLatestRef`・`useDocumentClick`・`useWindowEvent`・`getClippingAncestorBounds`）。

### Select

移植元: `shared/components/select/select.component.*`

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `options` | `SelectOption<T>[]` | （必須） | 選択肢 |
| `value` | `T \| null` | `null` | 選択中の値 |
| `onValueChange` | `(value: T \| null) => void` | - | 値が変わったとき（選択・クリア・矢印キー） |
| `onSelectionChange` | `(value: T) => void` | - | 選択肢を選んだとき（クリアでは呼ばない） |
| `placeholder` | `string` | `'選択してください'` | 未選択時の表示（移植元のハードコードどおり） |
| `disabled` | `boolean` | `false` | 無効 |
| `size` | `'default' \| 'small'` | `'default'` | 高さ 48px / 36px |
| `width` | `string` | `'240px'` | `size='small'` のときのドロップダウン幅 |
| `supportText` | `string` | `''` | ドロップダウン上部の補足 |
| `plainStyle` | `boolean` | `false` | 選択済みでも背景色・ブランド色を付けない |
| `showClear` | `boolean` | `true` | クリアボタンを出す |
| `classNameInputSelect` | `string` | `''` | トリガーに足すクラス |
| `className` | `string` | - | ホスト要素に足すクラス |

キーボード: Enter/Space で開閉、Esc で閉じる、↓ で開く・次を選ぶ、↑ で前を選ぶ。

```tsx
const [role, setRole] = useState<string | null>(null);
<Select options={roleOptions} value={role} onValueChange={setRole} placeholder={t('COMMON.SELECT')} />
```

### SelectWithSearch

移植元: `shared/components/select-with-search/select.component.*`（`<app-select-with-search>`）

Select と同じ props（`plainStyle`・`showClear`・`classNameInputSelect` を除く）に加えて:

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `testidPrefix` | `string \| null` | `null` | `${prefix}-trigger` / `${prefix}-option` の data-testid を付ける |

トリガーが入力欄になっており、入力した文字でラベルを部分一致（大文字小文字を区別しない）で絞り込む。クリアボタンは値と検索語の両方を空にする（`onValueChange(null)`）。

```tsx
<SelectWithSearch
  options={userOptions}
  value={userId}
  onValueChange={setUserId}
  testidPrefix="admin-user"
/>
```

### ChunkSelect

移植元: `shared/components/select/chunk-select/chunk-select.component.*`

チャンク分割（大・中・小）か任意の数値を選ぶ。「数値を指定」を選ぶと、PC は一覧の横に数値入力パネル、モバイルはドロワー内で数値入力に切り替わる。0 以下は確定できない。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `options` | `SelectOption<string>[]` | 大/中/小（`large`/`medium`/`small`） | 選択肢 |
| `value` | `string \| null` | `null` | 選択中の値（数値指定時は数値の文字列） |
| `onValueChange` | `(value: string \| null) => void` | - | 値が変わったとき |
| `onSelectionChange` | `(value: string) => void` | - | 選択・数値確定時は値、クリア時は `''` |
| `placeholder` | `string` | `'チャンク分割を選択'` | 未選択時の表示 |
| `disabled` | `boolean` | `false` | 無効（クリアボタンも出さない） |
| `size` | `'default' \| 'small' \| 'lg'` | `'small'` | `lg` は高さ 48px、それ以外は 36px |
| `plainStyle` | `boolean` | `true` | 選択済みでも背景色を付けない |
| `error` | `string` | `''` | 空文字以外ならエラー枠 |
| `className` | `string` | - | ホスト要素に足すクラス |

```tsx
<ChunkSelect value={chunk} onValueChange={setChunk} size="lg" error={chunkError} />
```

### MultiSelect

移植元: `shared/components/multi-select/multi-select.component.*`

チェックボックスで複数選択し、「決定」（`COMMON.CONFIRM_SELECTION`）で確定する。キャンセル・外側クリック・Esc では開く前の値に戻す。モバイルのドロワーは背景タップで確定する。チップの × はその場で確定する。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `options` | `SelectOption<T>[]` | （必須） | 選択肢 |
| `value` | `T[]` | `[]` | 選択中の値 |
| `onValueChange` | `(value: T[]) => void` | - | 内部の値が変わるたび（開いている間のチェック操作・キャンセル時の巻き戻しを含む。移植元の `(valueChange)` と同じ） |
| `onSelectionChange` | `(value: T[]) => void` | - | 確定・チップ削除で値が決まったとき |
| `placeholder` | `string` | `'選択してください'` | 未選択時の表示 |
| `disabled` | `boolean` | `false` | 無効 |
| `supportText` | `string` | `''` | ドロップダウン上部の補足 |
| `forceBelow` | `boolean` | `false` | デスクトップで常に下に開く（既定は下が狭ければ上に開く） |
| `size` / `width` | - | - | 移植元にあるが描画に使われていない |
| `className` | `string` | - | ホスト要素に足すクラス |

```tsx
// 確定した値だけ受け取る（移植元 group-detail-users と同じ使い方）
<MultiSelect options={userOptions} value={selection} onSelectionChange={setSelection} />
```

### ComboboxMulti

移植元: `shared/components/combobox-multi/combobox-multi.component.*`

検索で絞り込みながら複数選択し、「決定」で確定する。開いている間の選択は確定まで仮の値として持ち、キャンセル・外側クリック・Esc で捨てる。「すべて選択」は絞り込み中の選択肢だけが対象。閉じているときは 1 行に収まらないチップを隠して `+N` バッジを出す。見た目は `index.css` の `.combobox-*`。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `id` | `string` | （必須） | 検索欄（`${id}-search`）・リスト（`${id}-listbox`）の id |
| `name` | `string` | （必須） | 移植元にあるが描画に使われていない |
| `options` | `SelectOption<T>[]` | （必須） | 選択肢（`description`・`category` があれば 2 行表示、検索対象にもなる） |
| `value` | `T[]` | `[]` | 確定済みの値 |
| `onValueChange` | `(value: T[]) => void` | - | 確定（決定・閉じた状態でのチップ削除）で値が変わったとき |
| `onCommit` | `(value: T[]) => void` | - | 確定したとき（移植元の `(commit)`） |
| `label` | `string` | - | 見出し |
| `badgeText` | `string` | - | 見出し横のバッジ（「任意」など） |
| `supportText` | `string` | - | 見出し下の補足 |
| `errorMessage` | `string` | - | 見出し下のエラー文言 |
| `error` | `boolean` | `false` | エラー枠 |
| `placeholder` | `string` | `'選択してください'` | 未選択時の検索欄の表示 |
| `searchHint` | `string` | `''` | 検索欄の下の補足 |
| `emptyMessage` | `string` | `'表示するデータがありません'` | 絞り込み結果が空のときの文言 |
| `disabled` | `boolean` | `false` | 無効 |
| `filled` | `'active' \| 'inputed'` | - | トリガーの `data-filled` 属性 |
| `panelSize` | `'default' \| 'big' \| 'full'` | `'default'` | デスクトップのパネル幅（240px / 280px / トリガー幅） |
| `testidPrefix` | `string \| null` | `null` | `${prefix}-trigger` / `${prefix}-option` / `${prefix}-confirm-button` |
| `required` | `boolean` | - | 移植元にあるが描画に使われていない |
| `className` | `string` | - | ホスト要素（fieldset）に足すクラス |

```tsx
<ComboboxMulti
  id="assistant-groups"
  name="groups"
  label={t('ADMIN.ASSISTANT.BELONGING_TEAM')}
  badgeText={t('COMMON.OPTIONAL')}
  placeholder={t('ADMIN.ASSISTANT.SELECT_TEAM')}
  searchHint={t('ADMIN.ASSISTANT.TEAMS_SEARCH_HINT')}
  options={groupOptions}
  value={groupIds}
  onValueChange={setGroupIds}
  errorMessage={groupsError}
/>
```

### FormSelect

移植元: `shared/components/form/form-select/form-select.component.*`

見出し・補足・警告・エラー付きの Select。エラーがあるとセレクトの背景と枠がエラー色になる。

| prop | 型 | 既定値 | 説明 |
|---|---|---|---|
| `label` | `string` | （必須） | 見出し（翻訳済みの文言）。空文字なら見出し部分を出さない |
| `badgeText` | `string` | `''` | 見出し横のバッジ |
| `supportText` | `string` | `''` | 見出し下の補足 |
| `error` | `string` | `''` | エラー文言（警告アイコン付き） |
| `warning` | `string` | `''` | 警告文言（注意色） |
| `options` | `SelectOption<T>[]` | （必須） | 選択肢 |
| `value` | `T \| null` | `null` | 選択中の値 |
| `onValueChange` | `(value: T \| null) => void` | - | 選択・クリアのとき |
| `onFormBlur` | `() => void` | - | 値が変わった直後（touched にする用途。移植元の `(formBlur)`） |
| `placeholder` / `disabled` / `size` / `width` / `classNameInputSelect` | - | Select と同じ | Select にそのまま渡す |
| `dropdownSupportText` | `string` | `''` | Select の `supportText` |
| `inputId` | `string` | - | 移植元にあるが描画に使われていない |
| `className` | `string` | - | ホスト要素に足すクラス |

```tsx
<FormSelect
  label={t('ADMIN.USER_MANAGEMENT.ROLE')}
  options={roleOptions}
  value={form.role}
  onValueChange={(role) => setForm({ ...form, role })}
  onFormBlur={() => setTouched({ ...touched, role: true })}
  error={touched.role && !form.role ? t('VALIDATION.REQUIRED') : ''}
/>
```

---

## フォーム部品

フォーム系の部品はどれも制御コンポーネント（`value` を親が持ち、`onValueChange` で受け取って戻す）。`label` などの文言は呼び出し側で `t()` 済みの文字列を渡す（移植元も部品の中では翻訳しない）。エラー・警告は文字列を渡すと表示される。

### FormInput

移植元: `shared/components/form/form-input`（`app-form-input`）

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `label` | `string` | `''` | ラベル（翻訳済みの文言） |
| `badgeText` | `string` | `''` | ラベル右のバッジ（例: 任意） |
| `supportText` | `string` | `''` | ラベル下の補足文 |
| `placeholder` | `string` | `''` | |
| `type` | `'text' \| 'password' \| 'email' \| 'number'` | `'text'` | |
| `value` | `string` | 必須 | |
| `disabled` / `readOnly` | `boolean` | `false` | |
| `maxLength` | `number \| null` | `null` | 超えた分は切り捨てて通知する |
| `error` / `warning` | `string` | `''` | 入力欄の上にアイコン付きで表示。error は枠もエラー表示 |
| `autocomplete`（`autoComplete` も可） | `string` | `''` | |
| `showPasswordToggle` | `boolean` | `false` | `type='password'` のとき表示切替ボタンを出す |
| `asciiOnly` | `boolean` | `false` | 印字可能な ASCII 以外を取り除く |
| `inputId`（`id` も可） | `string` | - | ラベルの for と input の id |
| `endAdornment` | `ReactNode` | - | 入力欄の右に置く要素 |
| `dataTestid` | `string` | - | input の data-testid。エラー文言は `${dataTestid}-error` |
| `onValueChange`（`onChange` も可） | `(value: string) => void` | - | 移植元の valueChange |
| `onFormBlur` | `() => void` | - | 移植元の formBlur |
| `className` | `string` | - | ホスト要素に足すクラス |

```tsx
<FormInput
  inputId="userName"
  label={t('ADMIN.USER_MANAGEMENT.USER_NAME')}
  value={name}
  onValueChange={setName}
  maxLength={50}
  error={nameError}
  dataTestid="admin-users-name-input"
/>
<FormInput label={t('AUTH.LOGIN.PASSWORD_LABEL')} type="password" showPasswordToggle value={pw} onValueChange={setPw} />
```

### FormTextarea

移植元: `shared/components/form/form-textarea`（`app-form-textarea`）

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `label` | `string` | 必須 | |
| `badgeText` / `supportText` / `placeholder` | `string` | `''` | |
| `value` | `string` | 必須 | |
| `disabled` | `boolean` | `false` | |
| `error` | `string` | `''` | textarea の下に表示し、枠を赤にする |
| `rows` | `number` | `4` | |
| `textareaId` | `string` | `''` | |
| `areaHeight` | `number` | - | 最小の高さ（px） |
| `textareaClass` | `string` | `''` | textarea に足すクラス |
| `onValueChange` / `onFormBlur` | | - | |

```tsx
<FormTextarea label={t('COMMON.DESCRIPTION')} value={desc} onValueChange={setDesc} rows={6} />
```

### FormSwitch

移植元: `shared/components/form/form-switch`（`app-form-switch`）。中身は `Switch`。

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `label` | `string` | 必須 | |
| `badgeText` / `supportText` / `error` / `warning` | `string` | `''` | |
| `inputId` | `string` | `''` | ラベルの for |
| `switchLabel` | `string` | `''` | スイッチ右の文言 |
| `checked` | `boolean` | `false` | |
| `disabled` | `boolean` | `false` | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | |
| `showIcon` | `boolean` | `true` | つまみの中のアイコン |
| `dataTestid` | `string` | - | スイッチを包む要素の data-testid |
| `onCheckedChange` | `(checked: boolean) => void` | - | |
| `onFormBlur` | `() => void` | - | 移植元どおり切り替えのたびに呼ばれる |

```tsx
<FormSwitch label={t('ADMIN.TENANT.ENABLE')} checked={enabled} onCheckedChange={setEnabled} />
```

### FormRadio

移植元: `shared/components/form/form-radio`（`app-form-radio`）

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `options` | `FormRadioOption<T>[]`（`{ label, value, disabled?, testid? }`） | 必須 | `testid` はその選択肢の input の data-testid |
| `value` | `T \| null` | `null` | |
| `label` / `badgeText` / `supportText` / `error` / `warning` | `string` | `''` | |
| `disabled` | `boolean` | `false` | |
| `layout` | `'horizontal' \| 'vertical'` | `'horizontal'` | |
| `name` | `string` | 自動 | 省略すると部品ごとに一意な name |
| `inputClass` | `string` | `''` | 各選択肢の label に足すクラス |
| `classOption` | `string` | `''` | 選択肢の並びのクラス（gap の上書き） |
| `onValueChange` / `onFormBlur` | | - | |

```tsx
<FormRadio
  label={t('ADMIN.USER_MANAGEMENT.ROLE')}
  options={[
    { label: t('ROLE.ADMIN'), value: 'ADMIN' },
    { label: t('ROLE.USER'), value: 'USER' },
  ]}
  value={role}
  onValueChange={setRole}
/>
```

### FormSortInput

移植元: `shared/components/form/form-sort-input`（`app-form-sort-input`）。並べ替え項目と昇順/降順を選ぶ。デスクトップはトリガー下のメニュー（移植元は mat-menu）、モバイルはボトムドロワー。

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `fields` | `SortOption[]`（`{ value, label }`。label は i18n キー） | 更新日時順 / 用語順 | |
| `orders` | `SortOption[]` | 昇順 / 降順 | |
| `selectedField` / `selectedOrder` | `string \| null` | `null` | |
| `placeholder` | `string`（i18n キー） | `'更新日時順'` | |
| `size` | `'sm' \| 'md'` | `'md'` | |
| `disabled` | `boolean` | `false` | |
| `testidPrefix` | `string` | - | `${prefix}-trigger` / `-field-option` / `-order-option` / `-backdrop` |
| `onFieldChange` / `onOrderChange` | `(value: string \| null) => void` | - | 値が変わったときだけ呼ばれる。クリア時は null |
| `onClear` | `() => void` | - | |

```tsx
<FormSortInput
  size="sm"
  fields={SORT_FIELDS}
  selectedField={sortField}
  selectedOrder={sortOrder}
  onFieldChange={setSortField}
  onOrderChange={setSortOrder}
/>
```

### FormCombobox

移植元: `shared/components/form/form-combobox`（`app-form-combobox`）。チェックボックス付きの複数選択（すべて選択あり）。選択中の項目はトリガーにチップで出て、チップの × で外せる。

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `label` | `string` | 必須 | |
| `badgeText` / `supportText` / `error` | `string` | `''` | |
| `placeholder` | `string` | `'選択してください'` | |
| `options` | `ComboboxOption[]`（`{ value, label, disabled?, description?, tag?, category? }`） | `[]` | |
| `value` | `string[]` | `[]` | |
| `disabled` | `boolean` | `false` | |
| `onValueChange` | `(value: string[]) => void` | - | |
| `onFormBlur` | `() => void` | - | ドロップダウンを閉じたとき |

```tsx
<FormCombobox label={t('ADMIN.GROUP')} options={groupOptions} value={groupIds} onValueChange={setGroupIds} />
```

### SearchInput

移植元: `shared/components/input/search-input.component`（`app-search-input`）

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `value` | `string` | `''` | |
| `placeholder` / `ariaLabel` | `string`（i18n キー） | `''` | |
| `size` | `'default' \| 'small'` | `'default'` | small はデスクトップで幅 160px |
| `showSearchIcon` / `showClearButton` | `boolean` | `true` | |
| `inputClass` | `string` | `''` | input に足すクラス |
| `dataTestid` | `string` | - | input の data-testid |
| `onValueChange` | `(value: string) => void` | - | クリア時は '' |
| `onCleared` | `() => void` | - | |

```tsx
<SearchInput
  size="small"
  value={keyword}
  placeholder="COMMON.SEARCH_PLACEHOLDER"
  onValueChange={setKeyword}
/>
```

---

## フィルター・ファイル・ローディングほか

### PeriodFilter（期間フィルター）

移植元: `shared/components/filter/period-filter/`（`period-filter.component.*`）→ `period-filter.tsx`

プリセット（全期間・今日・過去7日間・過去30日間）と「期間を指定」（カレンダーで開始日・終了日を選ぶ）を持つフィルター。PC はトリガーの下にパネル、モバイル（幅 768px 未満）はボトムドロワー。外側クリック・Escape で閉じる。

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `options` | `PeriodOption[]` | 全期間 / 今日 / 7日 / 30日 | `{ value, label(i18n キー) }` |
| `placeholder` | `string` | `'COMMON.PERIOD_FILTER.ALL_PERIODS'` | 未選択時の文言（i18n キー） |
| `size` | `'default' \| 'small'` | `'default'` | 高さ 48px / 36px |
| `disabled` | `boolean` | `false` | |
| `allowCustom` | `boolean` | `true` | 「期間を指定」を出す |
| `testidPrefix` | `string \| null` | `null` | `${prefix}-trigger` / `-option` / `-custom` / `-from-input` / `-to-input` / `-apply-button` / `-calendar-today` を付ける |
| `value` | `string \| null` | `null` | 選択中のキー。期間指定は `'custom'` |
| `range` | `PeriodRange \| null` | `null` | `{ from, to }`（`YYYY/MM/DD`） |
| `onValueChange` | `(value: string) => void` | | |
| `onRangeChange` | `(range: PeriodRange \| null) => void` | | |
| `onSelectionChange` | `(change: PeriodChange) => void` | | `{ value, range }` |
| `className` | `string` | | ホスト要素に足すクラス |

```tsx
const [period, setPeriod] = useState<string | null>('');
const [range, setRange] = useState<PeriodRange | null>(null);

<PeriodFilter
  value={period}
  range={range}
  onValueChange={setPeriod}
  onRangeChange={setRange}
  testidPrefix="chat-history-period"
/>;
```

#### period-filter-utils.ts

| 関数 | 説明 |
|---|---|
| `resolvePeriodRange(period, range)` | 選択を暦日 `{ from, to }` にする（プリセットは `YYYY-MM-DD`、custom はそのまま） |
| `toDateTimeRange({ from, to })` | 暦日を「開始日 0:00」「終了日の翌日 0:00」の UTC ISO 文字列にする（API に送る直前に使う） |

```ts
const params = toDateTimeRange(resolvePeriodRange(period ?? '', range));
// => { from: '2026-10-02T15:00:00.000Z', to: '2026-10-09T15:00:00.000Z' }
```

### DropdownSelect（ドロップダウン選択）

移植元: `shared/components/filter/dropdown-select/` → `dropdown-select.tsx`

トリガーをクリックすると、body 直下（CDK overlay 相当）に選択肢のパネルと暗い backdrop を出す。backdrop クリックで閉じる。

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `options` | `DropdownOption[]` | （必須） | `{ label, value, icon?(material-symbols 名) }` |
| `placeholder` | `string` | `''` | 未選択時の文言。空なら先頭の選択肢 |
| `translateLabels` | `boolean` | `true` | label を i18n キーとして翻訳する |
| `panelWidth` | `string \| number` | `'auto'` | パネル幅（数値は px） |
| `value` | `string` | `''` | |
| `onValueChange` | `(value: string) => void` | | |
| `className` | `string` | | |

```tsx
<DropdownSelect
  options={[
    { label: 'COMMON.ALL', value: 'all' },
    { label: 'COMMON.ACTIVE', value: 'active' },
  ]}
  value={status}
  onValueChange={setStatus}
/>
```

### DateRangeSelect（期間選択・日付入力つき）

移植元: `shared/components/filter/date-range-select/` → `date-range-select.tsx`

プリセットの一覧と、「期間を指定」行にホバーすると右に開く日付入力（`<input type="date">`）のサブメニュー。移植元でも画面からは使われていない。

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `options` | `DateRangeOption[]` | （必須） | `{ label(i18n キー), value }` |
| `period` | `string` | `'all'` | 選択中のキー。期間指定は `'custom'` |
| `customRange` | `DateRangeValue \| null` | `null` | `{ start, end }`（`YYYY-MM-DD`） |
| `onPeriodChange` | `(period: string) => void` | | |
| `onCustomRangeChange` | `(range: DateRangeValue \| null) => void` | | |
| `onHandleChange` | `(change: { period; customRange? }) => void` | | 移植元の output `handleChange` |
| `className` | `string` | | |

```tsx
<DateRangeSelect
  options={periodOptions}
  period={period}
  customRange={customRange}
  onPeriodChange={setPeriod}
  onCustomRangeChange={setCustomRange}
/>
```

### FileUpload（ファイルのドロップ・選択）

移植元: `shared/components/file/file-upload/` → `file-upload.tsx`

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `id` | `string` | `'file-upload'` | ファイル input の id（フォルダ用は `${id}-folder`） |
| `variant` | `'simple' \| 'full'` | `'simple'` | `full` はファイル選択・フォルダ選択のボタンを出す |
| `onFilesSelected` | `(files: File[]) => void` | | ドロップ・選択したファイル |
| `className` | `string` | | |

```tsx
<FileUpload variant="full" onFilesSelected={(files) => addFiles(files)} />
```

### FileChip（添付ファイルのチップ）

移植元: `shared/components/file/file-chip.component.*` → `file-chip.tsx`

ファイル名と種別ラベル（PDF / DOC / XLS / 画像形式 / 拡張子）を出す。`data-testid="chat-attached-file-item"`。

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `file` | `File` | （必須） | |
| `showRemoveBtn` | `boolean` | `true` | |
| `onRemove` | `() => void` | | 削除ボタン |
| `className` | `string` | | |

```tsx
{files.map((file, i) => (
  <FileChip key={file.name} file={file} onRemove={() => removeFile(i)} />
))}
```

### FileImageChip（添付画像のサムネイル）

移植元: `shared/components/file-image/` → `file-image-chip.tsx`

64×64 のサムネイル。props は FileChip と同じ（`file` / `showRemoveBtn` / `onRemove` / `className`）。

```tsx
<FileImageChip file={image} onRemove={() => removeFile(i)} />
```

### FileChipDocument（文書ファイルのチップ）

移植元: `shared/components/file-chip-document/` → `file-chip-document.tsx`

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `name` | `string` | （必須） | ファイル名。拡張子を大文字で添える |
| `className` | `string` | | |

```tsx
<FileChipDocument name={attachment.fileName} />
```

### CircularProgress（使用量の円グラフ）

移植元: `shared/components/circular-progress/` → `circular-progress.tsx`

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `current` | `number` | （必須） | 使用量 |
| `limit` | `number` | （必須） | 上限（0 なら 0%） |
| `label` | `string` | `'今月の使用量'` | 移植元どおり日本語固定 |
| `className` | `string` | | |

```tsx
<CircularProgress current={usage.used} limit={usage.limit} />
```

### CircularLoading（リングのローディング）

移植元: `shared/components/circular-loading/` → `circular-loading.tsx`

props は `className` のみ。

```tsx
{isLoading && <CircularLoading />}
```

### Skeleton / SkeletonBlock（読み込み中のプレースホルダー）

移植元: `shared/components/skeleton/` → `skeleton.tsx`

Skeleton:

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `variant` | `'text' \| 'circle' \| 'rect'` | `'rect'` | |
| `width` | `string` | `'100%'` | CSS の幅 |
| `height` | `string` | `'1rem'` | CSS の高さ |
| `rounded` | `string` | `'rounded'` | `rect` のときの角丸クラス |
| `className` | `string` | | |

SkeletonBlock: `length: number`（行数、必須）、`className`。

```tsx
<Skeleton variant="circle" width="1.25rem" height="1.25rem" />
<SkeletonBlock length={5} />
```

### Loading（ロゴつきローディング）

移植元: `shared/components/loading/` → `loading.tsx`

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `message` | `string` | `'CHAT.LOADING'` | i18n キー |
| `showMessage` | `boolean` | `true` | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | ロゴと文言の間隔（gap-3 / 6 / 8） |
| `logoSrc` | `string` | `'/logo-min.svg'` | |
| `padding` | `string` | | 移植元でも未使用（受け取るだけ） |
| `className` | `string` | | |

```tsx
{isPending && <Loading />}
```

### OptionalLabel（「任意」ラベル）

移植元: `shared/components/labels/` → `optional-label.tsx`

props は `className` のみ。文言は `CHAT.VIEWER.SAVE_LIBRARY_DIALOG.OPTIONAL`。

```tsx
<label className="fieldset-title">
  {t('ADMIN.XXX.DESCRIPTION')}
  <OptionalLabel />
</label>
```

### Radio（ラジオボタン）

移植元: `shared/components/radio/` → `radio.tsx`。見た目は index.css の `.input-radio*`。

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `name` | `string` | （必須） | |
| `value` | `string \| number` | （必須） | |
| `label` | `string` | `''` | 表示文言（翻訳しない。必要なら `t()` を渡す） |
| `disabled` | `boolean` | `false` | |
| `checked` | `boolean` | `false` | |
| `onHandleChange` | `(value: string \| number) => void` | | 選ばれたとき自分の value を通知（移植元の output `handleChange`） |
| `children` | `ReactNode` | | label の前に出す内容 |
| `className` | `string` | | |

```tsx
{options.map((o) => (
  <Radio
    key={o.value}
    name="visibility"
    value={o.value}
    label={t(o.label)}
    checked={visibility === o.value}
    onHandleChange={(v) => setVisibility(String(v))}
  />
))}
```
