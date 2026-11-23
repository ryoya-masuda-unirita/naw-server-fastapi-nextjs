import type { ChatInputControls } from '@/hooks/use-chat-input-controls';
import type { ActiveFeature } from '@/lib/chat/active-feature';
import { ActiveFeaturesWidget } from './active-features-widget';
import { ChatAssistantSelector } from './chat-assistant-selector';

/** 有効にしている機能の数（移植元 ChatInputComponent.activeCount） */
function countActiveFeatures({
  webSearchActive,
  templateActive,
  createLibraryActive,
}: ChatInputControls): number {
  return (webSearchActive ? 1 : 0) + (templateActive ? 1 : 0) + (createLibraryActive ? 1 : 0);
}

/** 有効な機能を 1 つ外す（移植元 clearActiveFeature） */
function clearActiveFeature(controls: ChatInputControls, feature: ActiveFeature): void {
  if (feature === 'web') controls.setWebSearchActive(false);
  else if (feature === 'template') controls.setTemplateActive(null);
  else controls.setCreateLibraryActive(false);
}

/** 入力欄の送信ボタンの左に並べる、有効な機能のウィジェットとアシスタント選択 */
export function ChatInputToolbar({ controls }: { controls: ChatInputControls }) {
  return (
    <>
      <ActiveFeaturesWidget
        webSearchActive={controls.webSearchActive}
        templateActive={controls.templateActive}
        createLibraryActive={controls.createLibraryActive}
        activeCount={countActiveFeatures(controls)}
        onClearWebSearch={() => controls.setWebSearchActive(false)}
        onClearTemplate={() => controls.setTemplateActive(null)}
        onClearCreateLibrary={() => controls.setCreateLibraryActive(false)}
        onClearFeature={(feature) => clearActiveFeature(controls, feature)}
      />
      <ChatAssistantSelector
        assistants={controls.assistants}
        selectedAssistant={controls.selectedAssistant}
        onAssistantSelect={controls.setSelectedAssistant}
      />
    </>
  );
}
