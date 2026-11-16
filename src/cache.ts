import { HashMap } from "./hash-map";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  openSync,
  fsyncSync,
  closeSync,
  rmSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
export function validateKey(key: unknown): asserts key is string {
  if (
    typeof key !== "string" ||
    !key.length ||
    Buffer.byteLength(key) > 1024 ||
    /[\u0000-\u001f\u007f]/.test(key) ||
    key === "." ||
    key === ".."
  )
    throw new HttpError(
      "Key must be 1–1024 UTF-8 bytes, without control characters or dot segments",
      400,
    );
}
export type CacheOptions = {
  maxEntries?: number;
  maxStorageBytes?: number;
  persistencePath?: string;
  cleanupIntervalMs?: number;
};
type Entry = { value: unknown; bytes: number; expiresAt?: number };
export class Cache {
  private store = new HashMap<Entry>();
  private storageBytes = 0;
  private hits = 0;
  private misses = 0;
  readonly maxEntries: number;
  readonly maxStorageBytes: number;
  constructor(private options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10_000;
    this.maxStorageBytes = options.maxStorageBytes ?? 16 * 1024 * 1024;
    for (const n of [
      this.maxEntries,
      this.maxStorageBytes,
      options.cleanupIntervalMs ?? 1000,
    ])
      if (!Number.isSafeInteger(n) || n < 1 || n > Number.MAX_SAFE_INTEGER)
        throw new RangeError(
          "Cache limits and cleanup interval must be positive safe integers",
        );
    if ((options.cleanupIntervalMs ?? 1000) > 2147483647)
      throw new RangeError("Cleanup interval exceeds timer limit");
    if (options.persistencePath) this.restore();
  }
  private restore(): void {
    let raw: string;
    try {
      raw = readFileSync(this.options.persistencePath!, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    const data = JSON.parse(raw) as {
      version: number;
      entries: Array<{ key: string; value: unknown; expiresAt?: number }>;
    };
    if (!data || data.version !== 1 || !Array.isArray(data.entries))
      throw new Error("Invalid cache snapshot");
    for (const row of data.entries) {
      if (!row || !Object.hasOwn(row, "value"))
        throw new Error("Invalid snapshot entry");
      validateKey(row.key);
      if (this.store.has(row.key)) throw new Error("Duplicate snapshot key");
      if (
        row.expiresAt !== undefined &&
        (!Number.isSafeInteger(row.expiresAt) || row.expiresAt < 0)
      )
        throw new Error("Invalid snapshot expiration");
      if (row.expiresAt !== undefined && row.expiresAt <= Date.now()) continue;
      const entry = this.entry(row.key, row.value, row.expiresAt);
      this.checkQuota(entry.bytes, true);
      this.store.set(row.key, entry);
      this.storageBytes += entry.bytes;
    }
  }
  private persist(key?: string, replacement?: Entry): void {
    if (!this.options.persistencePath) return;
    const entries = this.store
      .keys()
      .filter((k) => k !== key)
      .map((k) => ({ key: k, ...this.store.get(k)! }));
    if (key !== undefined && replacement) entries.push({ key, ...replacement });
    const path = this.options.persistencePath;
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(temp, JSON.stringify({ version: 1, entries }), {
        flag: "wx",
        mode: 0o600,
      });
      const fd = openSync(temp, "r");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temp, path);
    } catch {
      throw new HttpError("Unable to persist cache; write cancelled", 500);
    } finally {
      rmSync(temp, { force: true });
    }
  }
  private entry(key: string, value: unknown, expiresAt?: number): Entry {
    const serialized = JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === "number" && !Number.isFinite(item))
        throw new HttpError("Value must contain finite JSON numbers", 400);
      return item;
    });
    if (serialized === undefined)
      throw new HttpError("Value must be JSON", 400);
    return {
      value,
      bytes: Buffer.byteLength(key) + Buffer.byteLength(serialized),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    };
  }
  private checkQuota(delta: number, adding: boolean): void {
    if (
      (adding && this.store.size >= this.maxEntries) ||
      this.storageBytes + delta > this.maxStorageBytes
    )
      throw new HttpError("Cache capacity exceeded", 507);
  }
  private expiration(ttl: unknown, previous?: number): number | undefined {
    if (ttl === undefined) return previous;
    if (ttl === null) return undefined;
    if (
      typeof ttl !== "number" ||
      !Number.isFinite(ttl) ||
      ttl <= 0 ||
      !Number.isSafeInteger(Math.ceil(Date.now() + ttl * 1000))
    )
      throw new HttpError("ttl must be positive seconds or null", 400);
    return Math.ceil(Date.now() + ttl * 1000);
  }
  get(key: string, count = false): Entry | undefined {
    const entry = this.store.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.storageBytes -= entry.bytes;
      if (count) this.misses++;
      return undefined;
    }
    if (count) {
      if (entry) this.hits++;
      else this.misses++;
    }
    return entry;
  }
  cleanup(): void {
    for (const key of this.store.keys()) this.get(key);
  }
  keys(): string[] {
    this.cleanup();
    return this.store.keys();
  }
  write(key: string, value: unknown, create: boolean, ttl?: unknown): Entry {
    validateKey(key);
    this.cleanup();
    const old = this.get(key);
    if (create && old) throw new HttpError("Key already exists", 409);
    if (!create && !old) throw new HttpError("Key not found", 404);
    const entry = this.entry(key, value, this.expiration(ttl, old?.expiresAt));
    this.checkQuota(entry.bytes - (old?.bytes ?? 0), !old);
    this.persist(key, entry);
    this.store.set(key, entry);
    this.storageBytes += entry.bytes - (old?.bytes ?? 0);
    return entry;
  }
  change(key: string, delta: 1 | -1): Entry {
    const old = this.get(key);
    if (!old) throw new HttpError("Key not found", 404);
    if (typeof old.value !== "number" || !Number.isFinite(old.value))
      throw new HttpError("Value must be a finite number", 400);
    const value = old.value + delta;
    if (
      !Number.isFinite(value) ||
      Math.abs(value) > Number.MAX_SAFE_INTEGER ||
      value === old.value
    )
      throw new HttpError("Numeric limit exceeded", 400);
    return this.write(key, value, false);
  }
  delete(key: string): void {
    const old = this.get(key);
    if (!old) throw new HttpError("Key not found", 404);
    this.persist(key);
    this.store.delete(key);
    this.storageBytes -= old.bytes;
  }
  metrics() {
    this.cleanup();
    return {
      hits: this.hits,
      misses: this.misses,
      totalKeys: this.store.size,
      storageBytes: this.storageBytes,
      maxStorageBytes: this.maxStorageBytes,
      hitRate:
        this.hits + this.misses
          ? Math.round((this.hits / (this.hits + this.misses)) * 10000) / 100
          : 0,
    };
  }
}
