import { expect, test } from '../src/fixtures.ts';
import { startVectorDb, startWaha, vectorDbProperties, VECTOR_TABLE, WAHA_PORTS, type VectorDb, type WahaEnv } from '../src/waha-env.ts';

/**
 * 21_Waha!生成AI学習（3 項目）。項目書: 25DA61_結合テスト項目書_md/21_Waha!生成AI学習.md
 *
 * 項目書は、Waha! の学習・削除ジョブを人が実行し、出力ファイルとデータベースの値を見て確かめる項目。ここでは、このリポジトリの
 * Waha! エミュレーター（waha-emulator/）が埋め込みアダプタ（generative-ai-adapter/embedding-adapter）を動かすので、同じジョブを
 * servicerun API で実行し、出力ファイル（outputfile）と、実際のベクトル DB（pgvector。専用コンテナ）の行を確かめる。
 *
 * 移植元・実環境との違い:
 * - 埋め込みは Echo（キー不要の確認用）。実際の埋め込みモデル・Azure には接続しない。ベクトル DB は `onprem/vector-db`（pgvector + PGroonga + AGE）
 * - 項目書の `reject` フォルダの json・tsv（Waha! 本体が出す）は、エミュレーターにない。異常終了は result の `FAILURE: 理由` で確かめる
 * - 項目書の out.tsv は outputfile（行は `"ファイル ID"<TAB>"パート ID"`）。ベクトルの行は `public.docs`（項目書の `embeddinggraph_vectors4` 相当）
 * - GraphRAG のテーブル（embedding_graph・graphrag_s02.documents）への書き込みは、LLM でエンティティを抽出するため確かめられない（Echo では不可）
 */

const SPLIT_LENGTH = '100';
const SOURCE_REFERENCE = '/mnt/file-server';
const DOCUMENT_NAME = 'XYZ Webアプリケーション仕様書.md';
const CHUNK_SECTIONS = 8;
const MINIMUM_CHUNKS = 2;

let env: WahaEnv;
let vdb: VectorDb;

/** 学習する Markdown（複数のチャンクに分かれる長さ）。 */
function buildDocument(label: string): string {
  return Array.from({ length: CHUNK_SECTIONS }, (_, index) => `## 章${index}\n${label} の仕様 ${index}。ユーザーが商品を検索、購入、およびレビューする。`).join('\n\n');
}

interface LearnedRow {
  fileId: string;
  partId: string;
}

/** 学習の出力（TSV。行は CRLF 区切り、列は `"ファイル ID"<TAB>"パート ID"`）を読む。 */
function parseLearnOutput(output: string): LearnedRow[] {
  return output
    .split('\r\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [fileId, partId] = line.split('\t').map((value) => value.replaceAll('"', ''));
      return { fileId, partId };
    });
}

async function learn(label: string): Promise<LearnedRow[]> {
  const job = await env.client.run('kb-learn', {
    inputs: { file: buildDocument(label) },
    fileNames: { file: DOCUMENT_NAME },
    params: { splitLength: SPLIT_LENGTH, filepath: SOURCE_REFERENCE },
  });
  expect(job.result).toBe('SUCCESS');
  return parseLearnOutput(job.output);
}

function rowsInVectorDb(fileId: string): string[][] {
  return vdb.sql(`SELECT id, fileid, filepath FROM ${VECTOR_TABLE} WHERE fileid = '${fileId}' ORDER BY id`);
}

// 直列（default）: fullyParallel の設定を上書きし、このファイルの中は 1 つのワーカーで順に流す。エミュレーター・ベクトル DB は beforeAll で 1 つだけ起動する
test.describe.configure({ mode: 'default' });

test.describe('21_Waha!生成AI学習', () => {
  test.beforeAll(async () => {
    test.setTimeout(420_000);
    vdb = await startVectorDb('learn', WAHA_PORTS.learnVectorDb);
    const properties = vectorDbProperties(WAHA_PORTS.learnVectorDb);
    env = await startWaha({
      name: 'learn',
      port: WAHA_PORTS.learnEmulator,
      services: {
        'kb-learn': { adapter: 'embedding', operation: 'learn', defaultSplitLength: 1000, properties },
        'kb-sync': { adapter: 'embedding', operation: 'sync', properties },
        'kb-delete': { adapter: 'embedding', operation: 'delete', properties },
      },
    });
  });

  test.afterAll(async () => {
    await env?.stop();
    vdb?.stop();
  });

  test('[21-01] 学習（正常終了）', async () => {
    const job = await env.client.run('kb-learn', {
      inputs: { file: buildDocument('正常終了') },
      fileNames: { file: DOCUMENT_NAME },
      params: { splitLength: SPLIT_LENGTH, filepath: SOURCE_REFERENCE },
    });
    // ジョブが正常終了し、出力にはチャンクごとの行（ファイル ID・パート ID）が出る
    expect(job.result).toBe('SUCCESS');
    const rows = parseLearnOutput(job.output);
    expect(rows.length).toBeGreaterThanOrEqual(MINIMUM_CHUNKS);
    expect(new Set(rows.map((row) => row.fileId)).size).toBe(1);
    expect(new Set(rows.map((row) => row.partId)).size).toBe(rows.length);
    // 失敗したチャンクが 0 件。ベクトル DB の行数が出力の行数と同じ
    expect(rowsInVectorDb(rows[0].fileId)).toHaveLength(rows.length);
  });

  test('[21-01] 学習（異常終了）', async () => {
    // 学習するファイルがなければ、ジョブは異常終了（FAILURE と理由）になる
    const job = await env.client.run('kb-learn', { params: { splitLength: SPLIT_LENGTH, filepath: SOURCE_REFERENCE } });
    expect(job.result).toMatch(/^FAILURE/);
    expect(job.output).toBe('');
  });

  test('[21-02] No 1 の続き（ベクトルDB）', async () => {
    const rows = await learn('続き');
    const fileId = rows[0].fileId;
    // 出力の ID（ファイル ID・パート ID）に一致する行が、ベクトル DB にある
    const stored = rowsInVectorDb(fileId);
    expect(stored.map((row) => row[0]).sort()).toEqual(rows.map((row) => row.partId).sort());
    expect(stored.every((row) => row[1] === fileId)).toBe(true);
    // 学習時に渡した参照元（filepath）とファイル名が、ベクトル DB のパスになる
    expect(stored.every((row) => row[2] === `${SOURCE_REFERENCE}/${DOCUMENT_NAME}`)).toBe(true);
    // 同期のジョブでも、同じパート ID・ファイル ID が読める
    const sync = await env.client.run('kb-sync', { params: { start: '0', end: '100' } });
    expect(sync.result).toBe('SUCCESS');
    const synced = sync.output.split('\r\n').filter((line) => line.length > 0 && line.includes(fileId));
    expect(synced).toHaveLength(rows.length);
  });

  test('[21-02] No 1 の続き（GraphRAG）', async () => {
    test.skip(
      true,
      'embedding_graph の File の properties と graphrag_s02.documents への書き込みは、LLM でエンティティ・関係を抽出する GraphRAG の取り込みで行われる。専用環境には LLM がなく（Echo は JSON を返せない）確かめられないため'
    );
  });

  test('[21-03] 削除', async () => {
    const target = await learn('削除する');
    const kept = await learn('残す');
    expect(rowsInVectorDb(target[0].fileId)).toHaveLength(target.length);
    // 削除ジョブ: 学習で控えたパート ID を 1 行ずつ書いたファイルを渡す
    const job = await env.client.run('kb-delete', { inputs: { file: target.map((row) => row.partId).join('\n') } });
    expect(job.result).toBe('SUCCESS');
    // 削除したファイルの行はなくなり、ほかのファイルの行は残る
    expect(rowsInVectorDb(target[0].fileId)).toHaveLength(0);
    expect(rowsInVectorDb(kept[0].fileId)).toHaveLength(kept.length);
  });
});
