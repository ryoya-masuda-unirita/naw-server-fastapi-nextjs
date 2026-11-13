import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { PagedResponse } from '@/types/api-response.type';
import type {
  GroupApiItem,
  GroupApiResponse,
  GroupDetailApiItem,
  GroupListFilter,
  GroupListItem,
  GroupNamePayload,
} from '@/types/admin/group-management.types';

// 移植元 group-list の GroupApiService・GroupUsersApiService・GroupAssistantsApiService・
// GroupTemplatesApiService（一覧に必要な分）と、GroupListStore の名前解決をまとめたもの。

/** 移植元がテナント全体の選択肢を取るときの size */
const LOOKUP_PAGE_SIZE = 1000;
/**
 * グループ内の一覧を取るときの size。移植元は 1000 だが、backend は
 * `/api/admin/groups/{id}/users|assistants|prompt-templates` の size を 100 までしか受けない。
 * 超えると 422 になり補完が働かないため、backend の上限に合わせる。
 */
const GROUP_SCOPED_PAGE_SIZE = 100;

/** 一覧・名前解決・グループ内補完の key の先頭 */
const GROUP_LIST_QUERY_KEY = 'admin-group-list';
/** テンプレート管理などが使うグループ選択肢の key の先頭（作成後に更新する） */
const GROUP_OPTIONS_QUERY_KEY = 'admin-groups';

type NameKind = 'user' | 'admin' | 'assistant' | 'template';

/** id → 表示名の対応表。移植元の `userIdToName` など */
export interface NameLookup {
  users: ReadonlyMap<string, string>;
  assistants: ReadonlyMap<string, string>;
  templates: ReadonlyMap<string, string>;
}

const EMPTY_LOOKUP: NameLookup = {
  users: new Map(),
  assistants: new Map(),
  templates: new Map(),
};

interface NamedRow {
  id: string;
  name: string;
}

/** 取得に失敗したら ID のまま表示するので、共通のエラートーストは出さない（移植元の `catch` と同じ） */
const SILENT = { skipGlobalErrorToast: true } as const;

async function fetchTenantNames(path: string, sort: string): Promise<ReadonlyMap<string, string>> {
  const res = await apiClient.get<PagedResponse<NamedRow>>(path, {
    params: { page: 0, size: LOOKUP_PAGE_SIZE, sort },
    ...SILENT,
  });
  return new Map(res.content.map(({ id, name }) => [id, name]));
}

/**
 * 一覧のカードに出す名前を、ID から引くための対応表（移植元 `loadNameResolverMaps`）。
 * 3 つのうち 1 つでも失敗したら、移植元と同じく全部空にして ID のまま表示する。
 */
export function useNameLookup() {
  return useQuery({
    queryKey: [GROUP_LIST_QUERY_KEY, 'lookup'],
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<NameLookup> => {
      try {
        const [users, assistants, templates] = await Promise.all([
          fetchTenantNames(API_PATHS.ADMIN.USERS.LIST, 'updatedAt,desc'),
          fetchTenantNames(API_PATHS.ADMIN.ASSISTANTS.LIST, 'name,asc'),
          fetchTenantNames(API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST, 'name,asc'),
        ]);
        return { users, assistants, templates };
      } catch {
        return EMPTY_LOOKUP;
      }
    },
  });
}

/** 移植元 `GroupListStore.load` のうち API 呼び出し。失敗時の共通エラートーストは api-client が出す */
export function useGroupList(filter: GroupListFilter) {
  return useQuery({
    queryKey: [GROUP_LIST_QUERY_KEY, 'list', filter],
    // 移植元は画面を開いたときと操作したときだけ読み込む。フォーカスで再取得すると一覧がスピナーに替わってしまう
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiClient.get<GroupApiResponse>(API_PATHS.ADMIN.GROUPS.LIST, {
        params: {
          page: Math.max(0, filter.pageIndex - 1),
          size: filter.pageSize,
          q: filter.query,
          sort: filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined,
        },
      }),
  });
}

function preferNonEmpty(values: string[] | undefined): string[] | undefined {
  return values !== undefined && values.length > 0 ? values : undefined;
}

/**
 * ID の並びを表示名に変える。対応表にない ID は、backend が同じ並びで返す名前の配列
 * （`assistants`・`promptTemplates`）があればその名前、なければ ID のまま。
 * 移植元は ID のままにするが、backend は ID と名前の両方を返すため名前を使える。
 */
function resolveNames(
  kind: NameKind,
  ids: string[],
  lookup: NameLookup,
  fallbackNames: string[] = [],
): string[] {
  let map = lookup.users;
  if (kind === 'assistant') map = lookup.assistants;
  if (kind === 'template') map = lookup.templates;
  const canUseFallback = fallbackNames.length === ids.length;
  return ids.map((id, index) => map.get(id) ?? (canUseFallback ? fallbackNames[index] : id));
}

/** 移植元 `toViewModel`。一覧の 1 件をカードの表示用に変える */
export function toViewModel(item: GroupApiItem, lookup: NameLookup): GroupListItem {
  return {
    id: item.id,
    name: item.name,
    adminUserNames:
      preferNonEmpty(item.adminUserNames) ?? resolveNames('admin', item.adminUserIds ?? [], lookup),
    userNames: preferNonEmpty(item.userNames) ?? resolveNames('user', item.users ?? [], lookup),
    assistants: resolveNames(
      'assistant',
      item.assistantIds ?? item.assistants ?? [],
      lookup,
      item.assistants,
    ),
    templates: resolveNames(
      'template',
      item.promptTemplateIds ?? item.promptTemplates ?? [],
      lookup,
      item.promptTemplates,
    ),
    updatedAt: item.updatedAt,
  };
}

interface GroupMemberRow {
  displayName: string | null;
  name: string;
  groupAdmin: boolean;
}

/** グループ内の一覧から補う対象。足りないものだけ取る */
interface MissingMembership {
  users: boolean;
  assistants: boolean;
  templates: boolean;
}

function getMissingMembership(item: GroupListItem): MissingMembership {
  return {
    users: item.adminUserNames.length === 0 || item.userNames.length === 0,
    assistants: item.assistants.length === 0,
    templates: item.templates.length === 0,
  };
}

interface Membership {
  adminUserNames: string[];
  userNames: string[];
  assistants: string[];
  templates: string[];
}

/**
 * 移植元 `hydrateGroupMembershipInfo` の取得部分。グループ内の一覧から足りない名前を集める。
 * 移植元は 3 つとも取って足りない項目だけ使うので、結果が同じになるよう足りない分だけ取る。
 */
async function fetchMembership(groupId: string, missing: MissingMembership): Promise<Membership> {
  const params = { page: 0, size: GROUP_SCOPED_PAGE_SIZE };
  const [users, assistants, templates] = await Promise.all([
    missing.users
      ? apiClient.get<PagedResponse<GroupMemberRow>>(API_PATHS.ADMIN.GROUPS.USERS(groupId), {
          params: { ...params, sort: 'updatedAt,desc' },
          ...SILENT,
        })
      : null,
    missing.assistants
      ? apiClient.get<PagedResponse<NamedRow>>(API_PATHS.ADMIN.GROUPS.ASSISTANTS(groupId), {
          params: { ...params, sort: 'name,asc' },
          ...SILENT,
        })
      : null,
    missing.templates
      ? apiClient.get<PagedResponse<NamedRow>>(API_PATHS.ADMIN.GROUPS.TEMPLATES(groupId), {
          params: { ...params, sort: 'name,asc' },
          ...SILENT,
        })
      : null,
  ]);
  const userRows = users?.content ?? [];
  return {
    adminUserNames: userRows
      .filter((user) => user.groupAdmin)
      .map((user) => user.displayName ?? user.name),
    userNames: userRows.map((user) => user.displayName ?? user.name),
    assistants: (assistants?.content ?? []).map((assistant) => assistant.name),
    templates: (templates?.content ?? []).map((template) => template.name),
  };
}

/** 補完の結果を使い回す時間。実際に空のチームを、画面を開くたびに取り直さないため */
const MEMBERSHIP_STALE_MS = 60_000;

/**
 * 一覧に名前が足りないグループを、グループ内の一覧で補う（移植元 `hydrateMissingMembershipInfo`）。
 * 補完に失敗したグループはそのまま表示する。
 */
export function useHydratedGroupItems(items: GroupListItem[], enabled: boolean): GroupListItem[] {
  const results = useQueries({
    queries: items.map((item) => {
      const missing = getMissingMembership(item);
      return {
        queryKey: [GROUP_LIST_QUERY_KEY, 'membership', item.id, missing],
        enabled: enabled && (missing.users || missing.assistants || missing.templates),
        refetchOnWindowFocus: false,
        staleTime: MEMBERSHIP_STALE_MS,
        retry: false,
        queryFn: () => fetchMembership(item.id, missing),
      };
    }),
  });

  return items.map((item, index) => {
    const membership = results[index]?.data;
    if (!membership) return item;
    return {
      ...item,
      adminUserNames:
        item.adminUserNames.length > 0 ? item.adminUserNames : membership.adminUserNames,
      userNames: item.userNames.length > 0 ? item.userNames : membership.userNames,
      assistants: item.assistants.length > 0 ? item.assistants : membership.assistants,
      templates: item.templates.length > 0 ? item.templates : membership.templates,
    };
  });
}

/** 移植元 `GroupApiService.create`。作成後は一覧を取り直す */
export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GroupNamePayload) =>
      apiClient.post<GroupDetailApiItem>(API_PATHS.ADMIN.GROUPS.LIST, payload, SILENT),
    onSuccess: () => {
      // 対応表は作成で変わらないので、一覧だけ取り直す。待たないのは、作成に成功したのに
      // 再取得の失敗で「作成に失敗しました」と出さないため
      void queryClient.invalidateQueries({ queryKey: [GROUP_LIST_QUERY_KEY, 'list'] });
      // テンプレート管理などのグループ選択肢にも新しいグループを出す
      void queryClient.invalidateQueries({ queryKey: [GROUP_OPTIONS_QUERY_KEY] });
    },
  });
}
