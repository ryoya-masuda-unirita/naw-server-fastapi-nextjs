import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '../src/fixtures.ts';
import { ECHO_PROPERTIES, startAzureMock, startWaha, WAHA_PORTS, type AzureMock, type WahaEnv } from '../src/waha-env.ts';

/**
 * 20_Waha!生成AI連携（6 項目）。項目書: 25DA61_結合テスト項目書_md/20_Waha!生成AI連携.md
 *
 * 項目書は、Waha! のジョブ（Windows のファイルを入出力にする）を人が実行して確かめる項目。ここでは、このリポジトリの
 * Waha! エミュレーター（waha-emulator/）が同じ生成AIアダプタ（generative-ai-adapter/）を動かすので、同じジョブを
 * servicerun API（startsession → upload → execute → result → download）で実行し、出力ファイル（outputfile）を確かめる。
 *
 * 移植元・実環境との違い:
 * - 実際の Azure OpenAI・SecuAiGent クラウド（LLM）・Zapier/Slack には接続しない。Azure OpenAI は、同じ API の形（chat completions）で
 *   応える、このテスト専用の HTTP サーバー（モック）に向ける。モックが受けたリクエストで、アダプタが Azure に正しく話しかけたことを確かめる
 * - 項目書の `c:\temp\*.txt` は、エミュレーターの outputfile（アダプタが書く JSON）に読み替える
 * - 生成された文章の意味（「AI の回答として自然か」）は確かめられない。アダプタが LLM に渡した内容と、書き出した JSON の形を確かめる
 */

const RAG_CONTEXT_COUNT = 20;
const AZURE_ANSWER = 'Azure OpenAI の回答です';
const AZURE_DEPLOYMENT = 'spec-deployment';
const RESTORE_TEST_PHRASE = '整合性確認とリストアテスト';

interface ChatOutput {
  answer: string;
  filepaths: string[];
  references: { role: string; content: string }[];
  imageExplanations: unknown[];
}

let env: WahaEnv;
let azure: AzureMock;
let ragDir: string;

function buildContexts(count: number, content: (index: number) => string): unknown[] {
  return Array.from({ length: count }, (_, index) => ({
    sourceFilePath: `/docs/context-${index}.md`,
    sourceRef: `ref-${index}`,
    chunkId: `chunk-${index}`,
    chunkSequence: index,
    content: content(index),
    score: 0.5,
    retrievalSignals: { vector: true, pgroonga: false, graph: false },
  }));
}

function writeContextFile(fileName: string, contexts: unknown[]): string {
  const target = path.join(ragDir, fileName);
  writeFileSync(target, JSON.stringify({ schemaVersion: 1, query: 'テスト', generatedAt: '2026-01-01T00:00:00Z', contexts }));
  return target;
}

const AZURE_PROPERTIES = {
  VENDOR: 'AzureOpenAI',
  URL: '${AZURE_OPENAI_ENDPOINT}',
  API_KEY: '${AZURE_OPENAI_API_KEY}',
  MODEL_NAME: '${AZURE_OPENAI_DEPLOYMENT}',
};

// 直列（default）: fullyParallel の設定を上書きし、このファイルの中は 1 つのワーカーで順に流す。エミュレーター・ベクトル DB は beforeAll で 1 つだけ起動する
test.describe.configure({ mode: 'default' });

test.describe('20_Waha!生成AI連携', () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    azure = await startAzureMock(AZURE_ANSWER);
    ragDir = mkdtempSync(path.join(tmpdir(), 'spec-rag-'));
    mkdirSync(ragDir, { recursive: true });
    const manyContexts = writeContextFile('contexts-20.json', buildContexts(RAG_CONTEXT_COUNT, (index) => `コンテキスト ${index} の本文`));
    const restoreContext = writeContextFile('context-restore.json', buildContexts(1, () => `バックアップの手順です。${RESTORE_TEST_PHRASE}を行います。`));
    env = await startWaha({
      name: 'chat',
      port: WAHA_PORTS.chatEmulator,
      ragContextDir: ragDir,
      env: { AZURE_OPENAI_ENDPOINT: azure.url, AZURE_OPENAI_API_KEY: 'spec-azure-key', AZURE_OPENAI_DEPLOYMENT: AZURE_DEPLOYMENT },
      services: {
        'azure-chat': { outputType: 0, properties: AZURE_PROPERTIES },
        'rag-20': { outputType: 1, ragContextJson: manyContexts, properties: { ...AZURE_PROPERTIES, RAG_CONTEXT_JSON_ALLOW_ROOT: ragDir } },
        'rag-restore': { outputType: 1, ragContextJson: restoreContext, properties: { ...AZURE_PROPERTIES, RAG_CONTEXT_JSON_ALLOW_ROOT: ragDir } },
        'echo-chat': { outputType: 0, properties: ECHO_PROPERTIES },
      },
    });
  });

  test.afterAll(async () => {
    await env?.stop();
    await azure?.stop();
    if (ragDir) rmSync(ragDir, { recursive: true, force: true });
  });

  test('[20-01] Chat', async () => {
    // 項目書: Azure Chat ジョブ。生成AIサービスプロバイダー AzureOpenAI で正常終了し、出力が JSON 形式
    const question = '東京の今日の天気を教えてください';
    azure.requests.length = 0;
    const job = await env.client.run('azure-chat', { inputs: { question } });
    expect(job.result).toBe('SUCCESS');
    const output = JSON.parse(job.output) as ChatOutput;
    expect(output.answer).toBe(AZURE_ANSWER);
    expect(Object.keys(output)).toEqual(expect.arrayContaining(['answer', 'filepaths', 'references', 'imageExplanations']));
    // アダプタは Azure OpenAI の chat completions（デプロイ名・api-key・質問）で話しかける
    expect(azure.requests).toHaveLength(1);
    expect(azure.requests[0].path).toContain(`/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions`);
    expect(azure.requests[0].apiKey).toBe('spec-azure-key');
    expect(azure.requests[0].body).toContain(question);
  });

  test('[20-02] Chat', async () => {
    test.skip(
      true,
      '生成AIサービスプロバイダー「SecuAiGent」は、クラウド（backend の POST /api/llm/chat）経由で実際の LLM と web_search を呼び、推論の途中経過（reasoning_delta）を受け取る。専用環境には LLM がなく確かめられないため'
    );
  });

  test('[20-03] Chat', async () => {
    test.skip(
      true,
      'SecuAiGent textData JSON（アクセストークン・tools: web_search）でクラウドの LLM を呼ぶ項目で、実際の LLM と web_search が要る。専用環境では確かめられないため'
    );
  });

  test('[20-04] MCP', async () => {
    test.skip(true, 'Zapier の MCP サーバーと Slack への投稿（外部サービス）が要り、専用環境では確かめられないため');
  });

  test('[20-05] RAG', async () => {
    // 項目書: RAG コンテクスト ジョブ。コンテキストを元に回答が出力される（正常終了）。LLM（モック）は RAG の回答の契約（JSON）で応える
    azure.requests.length = 0;
    const job = await env.client.run('rag-20', { inputs: { question: 'コンテキストの内容を要約してください' } });
    expect(job.result).toBe('SUCCESS');
    const output = JSON.parse(job.output) as ChatOutput;
    expect(output.answer).toBe(AZURE_ANSWER);
    // 20 件のコンテキストがすべて、LLM への入力に入る
    // 回答の依頼のあとに、回答の検証の依頼がもう 1 回ある。1 回目が回答の依頼
    expect(azure.requests.length).toBeGreaterThanOrEqual(1);
    // プロンプトには、各コンテキストが記事の一覧と「Context path」の 2 か所に入るため、重ならない ID の数で数える
    expect(new Set(azure.requests[0].body.match(/RAG_CONTEXT_BEGIN id=chunk-\d+/g))).toHaveProperty('size', RAG_CONTEXT_COUNT);
    for (let index = 0; index < RAG_CONTEXT_COUNT; index++) expect(azure.requests[0].body).toContain(`コンテキスト ${index} の本文`);
  });

  test('[20-06] RAG', async () => {
    // 項目書: RAG コンテクスト Json ジョブ。コンテキストの内容（整合性確認とリストアテスト）が回答の根拠として使われる
    azure.requests.length = 0;
    const job = await env.client.run('rag-restore', { inputs: { question: 'バックアップの確認方法は？' } });
    expect(job.result).toBe('SUCCESS');
    const output = JSON.parse(job.output) as ChatOutput;
    expect(output.answer).toBe(AZURE_ANSWER);
    // 根拠にしたコンテキスト（整合性確認とリストアテスト）が、引用資料に入る
    expect(output.references).toHaveLength(1);
    expect(output.references[0].content).toContain(RESTORE_TEST_PHRASE);
    expect(azure.requests.length).toBeGreaterThanOrEqual(1);
    expect(azure.requests[0].body).toContain(RESTORE_TEST_PHRASE);
  });
});
