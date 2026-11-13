import { expect, test } from '../src/fixtures.ts';
import {
  ECHO_PROPERTIES,
  readRetrievalContext,
  startVectorDb,
  startWaha,
  vectorDbProperties,
  WAHA_PORTS,
  type VectorDb,
  type WahaEnv,
} from '../src/waha-env.ts';

/**
 * 22_Waha!生成AI検索（2 項目）。項目書: 25DA61_結合テスト項目書_md/22_Waha!生成AI検索.md
 *
 * 項目書は、「一括 学習」を 1 回実行してから、Waha! の検索ジョブを実行して出力ファイルを見る項目。ここでは、このリポジトリの
 * Waha! エミュレーター（waha-emulator/）が埋め込みアダプタ（学習）と検索アダプタ（generative-ai-adapter/retrieval-adapter）を動かすので、
 * 同じ流れを servicerun API と、実際のベクトル DB（pgvector。専用コンテナ）で確かめる。
 *
 * 移植元・実環境との違い:
 * - 埋め込みは Echo（キー不要の確認用）。実際の埋め込みモデルには接続しない
 * - エミュレーターに「検索だけ」のジョブはなく、検索（4 件）の結果は RAG の回答（references）に入る。項目書の search.tsv（4 つの ID）は、
 *   references の ID で確かめる
 * - 項目書の context.json は、検索アダプタが書く RAG Context JSON。エミュレーターは検索結果を回答に渡して消すため、
 *   同じ検索の呼び出しを Python のスクリプト（scripts/retrieval_context.py）で再現して取る
 * - graphEvidence（GraphRAG の経路）は、グラフに関係を書くのに LLM が要るため確かめられない
 */

const SEARCH_COUNT = 4;
const SPLIT_LENGTH = '100';
const SOURCE_REFERENCE = '/mnt/file-server';
const DOCUMENT_NAME = 'XYZ Webアプリケーション仕様書.md';
const CHUNK_SECTIONS = 8;
const QUESTION = 'ユーザーが商品を購入する流れ';

let env: WahaEnv;
let vdb: VectorDb;
let learnedPartIds: string[];

interface ChatOutput {
  answer: string;
  filepaths: string[];
  references: { role: string; content: string }[];
}

// 直列（default）: fullyParallel の設定を上書きし、このファイルの中は 1 つのワーカーで順に流す。エミュレーター・ベクトル DB は beforeAll で 1 つだけ起動する
test.describe.configure({ mode: 'default' });

test.describe('22_Waha!生成AI検索', () => {
  test.beforeAll(async () => {
    test.setTimeout(420_000);
    vdb = await startVectorDb('search', WAHA_PORTS.searchVectorDb);
    const properties = vectorDbProperties(WAHA_PORTS.searchVectorDb);
    env = await startWaha({
      name: 'search',
      port: WAHA_PORTS.searchEmulator,
      services: {
        'kb-learn': { adapter: 'embedding', operation: 'learn', defaultSplitLength: 1000, properties },
        // 質問を検索文字列にして検索アダプタ（4 件）を動かし、結果を生成AIアダプタ（RAG）に渡す
        'kb-search': {
          outputType: 1,
          properties: { ...ECHO_PROPERTIES },
          retrieval: { properties: { ...properties, SEARCH_COUNT: String(SEARCH_COUNT), PROVIDER_LLM_RERANK_ENABLED: '0' } },
        },
      },
    });
    // 項目書の前提: 一括 学習 を 1 回だけ実行する
    const document = Array.from({ length: CHUNK_SECTIONS }, (_, index) => `## 章${index}\nXYZ Webアプリケーションの仕様 ${index}。ユーザーが商品を検索、購入、およびレビューする。`).join('\n\n');
    const learn = await env.client.run('kb-learn', {
      inputs: { file: document },
      fileNames: { file: DOCUMENT_NAME },
      params: { splitLength: SPLIT_LENGTH, filepath: SOURCE_REFERENCE },
    });
    expect(learn.result).toBe('SUCCESS');
    learnedPartIds = learn.output
      .split('\r\n')
      .filter((line) => line.length > 0)
      .map((line) => line.split('\t')[1].replaceAll('"', ''));
    expect(learnedPartIds.length).toBeGreaterThan(SEARCH_COUNT);
  });

  test.afterAll(async () => {
    await env?.stop();
    vdb?.stop();
  });

  test('[22-01] 検索', async () => {
    const job = await env.client.run('kb-search', { inputs: { question: QUESTION } });
    expect(job.result).toBe('SUCCESS');
    const output = JSON.parse(job.output) as ChatOutput;
    // 検索で見つかった 4 件が、回答の引用資料（references）に入る。ID は学習で登録したパート ID
    expect(output.references).toHaveLength(SEARCH_COUNT);
    const ids = output.references.map((reference) => /RAG_CONTEXT_BEGIN id=(\S+)/.exec(reference.content)?.[1] ?? '');
    expect(new Set(ids).size).toBe(SEARCH_COUNT);
    for (const id of ids) expect(learnedPartIds).toContain(id);
    expect(output.filepaths).toHaveLength(SEARCH_COUNT);
    expect(output.filepaths.every((filepath) => filepath === `${SOURCE_REFERENCE}/${DOCUMENT_NAME}`)).toBe(true);
  });

  test('[22-02] 検索 Context Json', async () => {
    const context = readRetrievalContext(env, 'kb-search', QUESTION);
    expect(context.schemaVersion).toBe(1);
    expect(Number.isNaN(Date.parse(context.generatedAt))).toBe(false);
    // 4 つのコンテキストのオブジェクトがある
    expect(context.contexts).toHaveLength(SEARCH_COUNT);
    for (const item of context.contexts) {
      expect(item.sourceFilePath).toBe(`${SOURCE_REFERENCE}/${DOCUMENT_NAME}`);
      expect(item.sourceRef).toBeTruthy();
      expect(learnedPartIds).toContain(item.chunkId);
      expect(item.content).toContain('XYZ Webアプリケーションの仕様');
      expect(typeof item.score).toBe('number');
      expect(item.retrievalSignals).toEqual(expect.objectContaining({ vector: true }));
      expect(Object.keys(item.retrievalSignals).sort()).toEqual(['graph', 'pgroonga', 'vector']);
    }
  });

  test('[22-02] 検索 Context Json（graphEvidence）', async () => {
    test.skip(
      true,
      'graphEvidence（graph_path の経路）は、GraphRAG のグラフ（Apache AGE）に LLM で抽出した関係を書いたときだけ付く。専用環境には LLM がなく（Echo は JSON を返せない）確かめられないため'
    );
  });
});
