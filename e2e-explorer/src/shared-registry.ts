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
const LOCK_TOKEN_FILE = 'owner';

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

  /** 取ったキーを手放す（操作が失敗して調べられなかったとき、他の担当範囲に譲るため）。 */
  async release(key: string, owner: string): Promise<void> {
    await this.withLock(async () => {
      const data = await this.read();
      if (data[key]?.owner !== owner) return;
      delete data[key];
      await this.write(data);
    });
  }

  /**
   * owner が取ったキーをすべて手放す。担当範囲を同じ出力先でもう一度流すとき、
   * 前回の自分の記録で共通の領域をすべて飛ばしてしまわないよう、開始時に呼ぶ。
   */
  async releaseOwner(owner: string): Promise<number> {
    return this.withLock(async () => {
      const data = await this.read();
      const keys = Object.keys(data).filter((k) => data[k].owner === owner);
      for (const key of keys) delete data[key];
      if (keys.length > 0) await this.write(data);
      return keys.length;
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

  /**
   * ロックは「持ち主の印（token）を入れたディレクトリ」を一時名で作り、ロックの名前へ付け替えて取る。
   * 付け替えは、相手が空でないディレクトリだと失敗するためアトミックに排他でき、
   * 中身があるので古いロックを壊す側が誤って上書きすることもない。
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const started = Date.now();
    for (;;) {
      const candidate = `${this.lockDir}.new-${token}`;
      await mkdir(candidate, { recursive: true });
      await writeFile(path.join(candidate, LOCK_TOKEN_FILE), token);
      try {
        await rename(candidate, this.lockDir);
        break;
      } catch (e) {
        await rm(candidate, { recursive: true, force: true });
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== 'ENOTEMPTY' && code !== 'EEXIST') throw e;
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
      await this.unlock(token);
    }
  }

  /** 自分の印が入ったロックだけを外す（古いとみなされて壊され、別のワーカーが取り直したロックは消さない）。 */
  private async unlock(token: string): Promise<void> {
    let current: string;
    try {
      current = await readFile(path.join(this.lockDir, LOCK_TOKEN_FILE), 'utf-8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw e;
    }
    if (current === token) await rm(this.lockDir, { recursive: true, force: true });
  }

  /**
   * 古いロックを壊す。調べてから消すまでの間に別のワーカーが新しいロックを取っていると、
   * それを消してしまう（2 人が同時に入る）ため、まず自分だけの名前に付け替え（アトミック）、
   * 付け替えたものが本当に古いかを確かめてから消す。新しいロックだったら元に戻す。
   */
  private async breakStaleLock(): Promise<void> {
    try {
      const info = await stat(this.lockDir);
      if (Date.now() - info.mtimeMs <= STALE_LOCK_MS) return;
      const moved = `${this.lockDir}.stale-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await rename(this.lockDir, moved);
      const movedInfo = await stat(moved);
      if (Date.now() - movedInfo.mtimeMs > STALE_LOCK_MS) {
        await rm(moved, { recursive: true, force: true });
        return;
      }
      try {
        await rename(moved, this.lockDir);
      } catch (e) {
        // 戻す前に別のワーカーがロックを取り直していた（ごく短い間の競合）。そのワーカーの排他を優先し、
        // 付け替えてしまったロックは捨てる。元の持ち主は unlock で自分の印がないことに気付き、何も消さない
        if ((e as NodeJS.ErrnoException).code !== 'ENOTEMPTY' && (e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        await rm(moved, { recursive: true, force: true });
      }
    } catch (e) {
      // 調べている間に持ち主が手放した・別のワーカーが先に壊した
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
}
