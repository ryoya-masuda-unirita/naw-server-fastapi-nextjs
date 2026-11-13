import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { GroupApiResponse } from '@/types/admin/group-management.types';
import type {
  TemplateApiItem,
  TemplateApiResponse,
  TemplateFilter,
} from '@/types/admin/template.types';

// 移植元 template-list の TemplateListApiService・GroupsApiService と、グループへの紐付け
// （GroupTemplatesApiService の addTemplates・remove）をまとめたもの。

/** 移植元 `GET /api/admin/groups` の size。グループの選択肢は全件取る */
const GROUP_OPTIONS_SIZE = 1000;

/**
 * サイドバーが `/dashboard`・`/chat/new` へ移るたびに無効化する key の先頭（#277）。
 * 一覧・変更後の再取得もこの先頭にそろえ、チャット側のテンプレート一覧も一緒に更新する。
 */
const TEMPLATES_QUERY_KEY = 'prompt-templates';
const GROUPS_QUERY_KEY = 'admin-groups';

/** 移植元 `CreateTemplatePayload`（`POST`・`PATCH /api/admin/prompt-templates`） */
export interface TemplatePayload {
  name: string;
  description?: string;
  systemPrompt: string;
  groups?: string[];
}

/** グループの選択肢（移植元 `GroupOption`） */
export interface GroupOption {
  id: string;
  name: string;
}

function toListParams(filter: TemplateFilter) {
  const sort = filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined;
  return {
    page: Math.max(0, filter.pageIndex - 1),
    size: filter.pageSize,
    team: filter.team,
    search: filter.query,
    sort,
  };
}

/** 移植元 `TemplateListStore.load`。失敗時の共通エラートーストは api-client が出す */
export function useTemplateList(filter: TemplateFilter) {
  return useQuery({
    queryKey: [TEMPLATES_QUERY_KEY, 'admin', filter],
    // 移植元は画面を開いたときと操作したときだけ読み込む。フォーカスで再取得すると一覧がスピナーに替わってしまう
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiClient.get<TemplateApiResponse>(API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST, {
        params: toListParams(filter),
      }),
  });
}

/** 絞り込み・フォームの選択肢にするグループ一覧（移植元 `GroupsApiService.list`） */
export function useGroupOptions() {
  return useQuery({
    queryKey: [GROUPS_QUERY_KEY, 'options'],
    queryFn: async (): Promise<GroupOption[]> => {
      const res = await apiClient.get<GroupApiResponse>(API_PATHS.ADMIN.GROUPS.LIST, {
        params: { size: GROUP_OPTIONS_SIZE },
      });
      return (res.data ?? []).map((group) => ({ id: group.id, name: group.name }));
    },
  });
}

function addToGroups(templateId: string, groupIds: string[]): Promise<unknown[]> {
  return Promise.all(
    groupIds.map((groupId) =>
      apiClient.post<void>(
        API_PATHS.ADMIN.GROUPS.TEMPLATES(groupId),
        { templateIds: [templateId] },
        { skipGlobalErrorToast: true },
      ),
    ),
  );
}

function removeFromGroups(templateId: string, groupIds: string[]): Promise<unknown[]> {
  return Promise.all(
    groupIds.map((groupId) =>
      apiClient.delete<void>(API_PATHS.ADMIN.GROUPS.TEMPLATE_DETAIL(groupId, templateId), {
        skipGlobalErrorToast: true,
      }),
    ),
  );
}

function useInvalidateTemplates() {
  const queryClient = useQueryClient();
  // 途中まで成功した場合（作成だけ済んでグループへの紐付けが失敗など）も一覧を最新にする
  return () => queryClient.invalidateQueries({ queryKey: [TEMPLATES_QUERY_KEY] });
}

export interface CreateTemplateVariables {
  payload: TemplatePayload;
  groupIds: string[];
}

/** 作成してから、選んだグループへ紐付ける（移植元 `submitAddTemplate`） */
export function useCreateTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({ payload, groupIds }: CreateTemplateVariables) => {
      const created = await apiClient.post<TemplateApiItem>(
        API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST,
        payload,
        { skipGlobalErrorToast: true },
      );
      await addToGroups(created.id, groupIds);
      return created;
    },
    onSettled: invalidate,
  });
}

export interface UpdateTemplateVariables {
  id: string;
  payload: TemplatePayload;
  previousGroupIds: string[];
  nextGroupIds: string[];
}

/** 更新してから、グループとの紐付けを差分で直す（移植元 `submitEditTemplate`・`syncTemplateGroups`） */
export function useUpdateTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({ id, payload, previousGroupIds, nextGroupIds }: UpdateTemplateVariables) => {
      const updated = await apiClient.patch<TemplateApiItem>(
        API_PATHS.ADMIN.PROMPT_TEMPLATES.DETAIL(id),
        payload,
        { skipGlobalErrorToast: true },
      );
      const previous = new Set(previousGroupIds);
      const next = new Set(nextGroupIds);
      const removals = [...previous].filter((groupId) => !next.has(groupId));
      const additions = [...next].filter((groupId) => !previous.has(groupId));
      // 移植元と同じく、解除を終えてから追加する
      await removeFromGroups(id, removals);
      await addToGroups(id, additions);
      return updated;
    },
    onSettled: invalidate,
  });
}

/** 選択した分をまとめて削除する（移植元 `submitDeleteTemplates`） */
export function useDeleteTemplates() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((id) =>
          apiClient.delete<void>(API_PATHS.ADMIN.PROMPT_TEMPLATES.DETAIL(id), {
            skipGlobalErrorToast: true,
          }),
        ),
      ),
    onSettled: invalidate,
  });
}
