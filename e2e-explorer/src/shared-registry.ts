import { mkdir, readFile, rm, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

/**
 * 全ワーカーで共有する「調査済みの一覧」。
 * ヘッダー・サイドバーのような全画面に共通の要素を、最初に取ったワーカーだけが調べ、
 * 他のワーカーは飛ばすために使う。別々のプロセスで担当範囲を実行しても、同じファイルを
 * 指せば共有できるよう、ロックはディレクトリの作成（アトミック）で取る。
 */

const LOCK_RETRY_MS = 20;
const LOCK_TIMEOUT_MS = 30_000;
/** これより古いロックは、持ち主のプロセスが落ちて残ったものとみなして壊す。 */
const STALE_LOCK_MS = 30_000;

interface RegistryEntry {
  owner: string;
  claimedAt: string;
}

type RegistryData = Record<string, RegistryEntry>;

export class SharedRegistry {
  readonly file: string;
  private readonly lockDir: string;

  constructor(file: string) {
    this.file = file;
    this.lockDir = `${file}.lock`;
  }

  /** key を取れたら true。すでに誰か（自分を含む）が取っていたら false。 */
  async claim(key: string, owner: string): Promise<boolean> {
    return this.withLock(async () => {
      const data = await this.read();
      if (data[key]) return false;
      data[key] = { owner, claimedAt: new Date().toISOString() };
      await this.write(data);
      return true;
    });
  }

  async entries(): Promise<RegistryData> {
    return this.read();
  }

  private async read(): Promise<RegistryData> {
    try {
      return JSON.parse(await readFile(this.file, 'utf-8')) as RegistryData;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw e;
    }
  }

  private async write(data: RegistryData): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    // 途中で落ちても壊れた JSON を残さないよう、一時ファイルに書いてから置き換える
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, this.file);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const started = Date.now();
    for (;;) {
      try {
        await mkdir(this.lockDir);
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        await this.breakStaleLock();
        if (Date.now() - started > LOCK_TIMEOUT_MS) {
          throw new Error(`調査済みの一覧のロックを取れません: ${this.lockDir}`, { cause: e });
        }
        await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
      }
    }
    try {
      return await fn();
    } finally {
      await rm(this.lockDir, { recursive: true, force: true });
    }
  }

  private async breakStaleLock(): Promise<void> {
    try {
      const info = await stat(this.lockDir);
      if (Date.now() - info.mtimeMs > STALE_LOCK_MS) {
        await rm(this.lockDir, { recursive: true, force: true });
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
}
