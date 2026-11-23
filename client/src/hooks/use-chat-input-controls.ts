import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAssistants } from '@/hooks/use-assistants';
import { resolveInitialAssistant } from '@/lib/utils/resolve-initial-assistant';
import type { Assistant } from '@/types/chat/assistant.type';

/** 入力欄で選ぶプロンプトテンプレート（移植元 template-selector の `Template`。選択 UI は #286） */
export interface ChatInputTemplate {
  value: string;
  label: string;
  desc: string;
  systemPrompt?: string;
}

/** 送信ごとに入力欄から取り出す値（移植元 chat-input の `send` 出力） */
export interface ChatSendPayload {
  content: string;
  files: File[];
  assistantId: string | null;
  useWebSearch: boolean;
  additionalPrompt?: string;
  createLibrary: boolean;
}

/**
 * 入力欄の状態。アシスタント選択（#286）・テンプレート選択（#286）・添付（#287）・メンション（#286）の部品は、
 * この値と setter を受け取って描画する（`ChatInput` の `renderXxx` スロット経由）。
 */
export interface ChatInputControls {
  messageContent: string;
  setMessageContent: (value: string) => void;
  assistants: Assistant[];
  isAssistantsLoading: boolean;
  selectedAssistant: Assistant | null;
  setSelectedAssistant: (assistant: Assistant) => void;
  attachedFiles: File[];
  setAttachedFiles: (files: File[] | ((current: File[]) => File[])) => void;
  webSearchActive: boolean;
  setWebSearchActive: (active: boolean) => void;
  templateActive: ChatInputTemplate | null;
  setTemplateActive: (template: ChatInputTemplate | null) => void;
  createLibraryActive: boolean;
  setCreateLibraryActive: (active: boolean) => void;
}

/** 新規チャット（ルームなし）を表すキー */
const NEW_CHAT_ROOM_KEY = '__new__';

interface Params {
  roomId: string | null;
  defaultAssistantId: string | null;
}

/**
 * 移植元 ChatInputComponent の signal 群。
 * 初期アシスタントはルームごとに 1 回だけ決める（同じルームのうちは、利用者が選んだものを保つ）。
 */
export function useChatInputControls({ roomId, defaultAssistantId }: Params): ChatInputControls {
  const { data, isPending } = useAssistants();
  const assistants = useMemo(() => data ?? [], [data]);
  const [messageContent, setMessageContent] = useState('');
  const [selectedAssistant, setSelectedAssistantState] = useState<Assistant | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [webSearchActive, setWebSearchActive] = useState(false);
  const [templateActive, setTemplateActive] = useState<ChatInputTemplate | null>(null);
  const [createLibraryActive, setCreateLibraryActive] = useState(false);
  const syncedRoomKey = useRef<string | null>(null);
  /** 初期アシスタントを決めたときの、ルームの既定アシスタント ID */
  const syncedDefaultId = useRef<string | null>(null);
  /** 利用者が（このルームで）自分で選んだか。選んでいれば初期値で上書きしない */
  const isUserSelected = useRef(false);

  const setSelectedAssistant = useCallback((assistant: Assistant) => {
    isUserSelected.current = true;
    setSelectedAssistantState(assistant);
  }, []);

  useEffect(() => {
    if (!assistants.length) return;

    const roomKey = roomId ?? NEW_CHAT_ROOM_KEY;
    if (syncedRoomKey.current !== roomKey) {
      isUserSelected.current = false;
    }
    // ルームの一覧が遅れて届き、ルームの既定アシスタントが後から分かったときは、選び直す（移植元はサイドバーが先に一覧を読み込むため起きない）
    const defaultArrivedLate = syncedDefaultId.current !== (roomId ? defaultAssistantId : null);
    if (
      syncedRoomKey.current === roomKey &&
      selectedAssistant &&
      (isUserSelected.current || !defaultArrivedLate)
    ) {
      return;
    }

    const resolved = resolveInitialAssistant(assistants, roomId ? defaultAssistantId : null);
    if (!resolved) return;

    // 一覧・ルームが決まった時点で 1 回だけ初期値を入れる（移植元の effect と同じ）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedAssistantState(resolved);
    syncedRoomKey.current = roomKey;
    syncedDefaultId.current = roomId ? defaultAssistantId : null;
  }, [assistants, roomId, defaultAssistantId, selectedAssistant]);

  return {
    messageContent,
    setMessageContent,
    assistants,
    isAssistantsLoading: isPending,
    selectedAssistant,
    setSelectedAssistant,
    attachedFiles,
    setAttachedFiles,
    webSearchActive,
    setWebSearchActive,
    templateActive,
    setTemplateActive,
    createLibraryActive,
    setCreateLibraryActive,
  };
}
