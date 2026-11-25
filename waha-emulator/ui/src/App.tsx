import { useCallback, useEffect } from 'react';

import { Canvas } from './components/Canvas';
import { Header } from './components/Header';
import { PropertyPanel } from './components/PropertyPanel';
import { WorkflowList } from './components/WorkflowList';
import { hasRetrieval } from './editor/model';
import { useEditor } from './editor/useEditor';

const DISCARD_CONFIRMATION = '未保存の変更があります。破棄して移動しますか？';

export function App() {
  const editor = useEditor();
  const { dirty, openId } = editor;

  // 未保存の変更を、移動の前に確かめる
  const confirmDiscard = useCallback(
    () => !dirty || window.confirm(DISCARD_CONFIRMATION),
    [dirty],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    // Ctrl/Cmd + S で保存する
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        void editor.save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  return (
    <div className="grid h-full grid-cols-[16rem_1fr_20rem] grid-rows-[auto_1fr]">
      <div className="col-span-3 border-b bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
        Waha! エミュレーター ワークフローエディター
      </div>
      <div className="row-start-2 min-h-0">
        <WorkflowList
          workflows={editor.workflows}
          openId={openId}
          onSelect={(id) => confirmDiscard() && void editor.open(id)}
          onCreate={(id, name, ids) => confirmDiscard() && editor.createNew(id, name, ids)}
          onDelete={(id) => void editor.remove(id)}
        />
      </div>
      <main className="row-start-2 flex min-h-0 min-w-0 flex-col">
        {openId ? (
          <>
            <Header
              name={editor.name}
              serviceIds={editor.serviceIds}
              dirty={dirty}
              busy={editor.busy}
              message={editor.message}
              onNameChange={editor.setName}
              onServiceIdsChange={editor.setServiceIds}
              onValidate={() => void editor.validate()}
              onSave={() => void editor.save()}
            />
            <div className="min-h-0 flex-1">
              <Canvas
                graphId={openId}
                nodes={editor.nodes}
                edges={editor.edges}
                onNodesChange={editor.onNodesChange}
                onEdgesChange={editor.onEdgesChange}
                onConnect={editor.connect}
                onAddRetrieval={() => editor.addNodeOfType('retrieval')}
              />
            </div>
          </>
        ) : (
          <div className="p-6 text-slate-500">
            {editor.message && (
              <p role="alert" className="mb-3 text-red-600">
                {editor.message.text}
              </p>
            )}
            左の一覧からワークフローを選ぶか、新規に作成してください。
          </div>
        )}
      </main>
      <div className="row-start-2 min-h-0">
        <PropertyPanel
          node={editor.selectedNode}
          catalog={editor.catalog}
          hasRetrieval={hasRetrieval(editor.nodes)}
          onChange={editor.updateNodeData}
        />
      </div>
    </div>
  );
}
