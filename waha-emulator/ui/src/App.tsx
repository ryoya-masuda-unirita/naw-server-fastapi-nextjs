import { useCallback, useEffect } from 'react';

import { Canvas } from './components/Canvas';
import { Header } from './components/Header';
import { PropertyPanel } from './components/PropertyPanel';
import { RunPanel } from './components/RunPanel';
import { WorkflowList } from './components/WorkflowList';
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
                onAddNode={editor.addNodeOfType}
              />
            </div>
            <RunPanel key={openId} graphId={openId} dirty={dirty} />
          </>
        ) : (
          <div className="p-6 text-slate-500">
            {editor.message && (
              <p role="alert" className="mb-3 text-red-600">
                {editor.message.text}
              </p>
            )}
            <h2 className="mb-2 text-base font-semibold text-slate-700">使い方</h2>
            <ol className="list-decimal space-y-1 pl-5">
              <li>左の「＋ 新規」で、ワークフローを作る（ID・名前・サービス ID）。すでにあるものは、一覧から選ぶ</li>
              <li>
                上の「＋ 生成AI」などで、ノードを足し、ノードの右の点から、次のノードの左の点へ、線を引く。ノードを選ぶと、右で、プロンプトなどを設定できる
              </li>
              <li>
                「保存」を押す。<b>サービス ID</b>
                （SecuAiGent のアシスタント ID と同じ値）で呼ばれると、このワークフローが動く
              </li>
              <li>下の「試し実行」に質問を入れて送ると、保存したワークフローの回答をその場で見られる</li>
            </ol>
            <p className="mt-3 text-xs">
              プロンプトの中では、<code>{'{{question}}'}</code>（質問）や、前のノードの出力
              <code>{'{{ノードID.text}}'}</code> を使えます（右の「変数を挿入」から選べます）。
            </p>
          </div>
        )}
      </main>
      <div className="row-start-2 min-h-0">
        <PropertyPanel
          node={editor.selectedNode}
          nodes={editor.nodes}
          edges={editor.edges}
          catalog={editor.catalog}
          onLabelChange={editor.updateNodeLabel}
          onConfigChange={editor.updateNodeConfig}
        />
      </div>
    </div>
  );
}
