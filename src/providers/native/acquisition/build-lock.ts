import { randomUUID } from "node:crypto";
import { linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { performance } from "node:perf_hooks";

// An exclusive cross-process lock for one native build, owned by a recorded process.
//
// The lock file at `path` holds its owner's record. It is published with link(2), which creates the name atomically
// and fails if anything exists there, so a lock is never observed without its owner and never replaces another lock.
// A lock whose owner provably no longer exists on this host is not deleted by waiters: exactly one waiter takes it over
// by linking its own record at `${path}.after-${staleToken}` (again exclusive), and the chain of stale records behind
// it is removed only by that holder when it releases. Every other lock (a live owner, another host, an owner that
// cannot be proven gone, or a record that cannot be read) is waited for until the timeout.

export interface NativeBuildLockOwner {
  readonly token: string;
  readonly pid: number;
  readonly host: string;
  // Process start time in clock ticks since boot (/proc/<pid>/stat field 22); null where /proc is unavailable,
  // in which case only a missing process proves the owner gone.
  readonly start: string | null;
}

export type NativeBuildLock =
  | { readonly kind: "held"; readonly release: () => void }
  | { readonly kind: "busy"; readonly path: string; readonly owner: NativeBuildLockOwner | undefined };

export function acquireNativeBuildLock(path: string, timeoutMilliseconds: number): NativeBuildLock {
  const own: NativeBuildLockOwner = Object.freeze({
    token: randomUUID(), pid: process.pid, host: hostname(), start: processStart(process.pid),
  });
  const started = performance.now();
  while (true) {
    const attempt = attemptAcquire(path, own);
    if (attempt.kind === "held") return attempt;
    if (performance.now() - started >= timeoutMilliseconds) return attempt;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

export function nativeBuildLockOwnerGone(owner: NativeBuildLockOwner): boolean {
  if (owner.host !== hostname()) return false;
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (isErrorCode(error, "ESRCH")) return true;
    if (!isErrorCode(error, "EPERM")) throw error;
  }
  // The pid exists. It is the owner unless its start time proves the pid was reused by another process.
  if (owner.start === null) return false;
  const current = processStart(owner.pid);
  return current !== null && current !== owner.start;
}

function attemptAcquire(path: string, own: NativeBuildLockOwner): NativeBuildLock {
  if (publish(path, own)) {
    return { kind: "held", release: () => release(path, own.token, []) };
  }
  const head = readOwner(path);
  if (head === undefined || !nativeBuildLockOwnerGone(head)) return { kind: "busy", path, owner: head };
  // Follow the takeover chain behind the stale head to its first live or free link.
  const chain: string[] = [];
  let stale = head;
  while (true) {
    const next = `${path}.after-${stale.token}`;
    chain.push(next);
    if (publish(next, own)) {
      // The head may have been released between reading it and taking over; the takeover is then orphaned.
      if (readOwner(path)?.token !== head.token) {
        removeIfPresent(next);
        return { kind: "busy", path, owner: readOwner(path) };
      }
      return { kind: "held", release: () => release(path, head.token, chain) };
    }
    const owner = readOwner(next);
    if (owner === undefined || !nativeBuildLockOwnerGone(owner)) return { kind: "busy", path, owner };
    stale = owner;
  }
}

function release(path: string, headToken: string, chain: readonly string[]): void {
  if (readOwner(path)?.token !== headToken) {
    throw new Error(`The native build lock ${path} changed owner while it was held.`);
  }
  unlinkSync(path);
  for (const link of chain) unlinkSync(link);
}

function publish(path: string, owner: NativeBuildLockOwner): boolean {
  const temporary = `${path}.${owner.token}.${randomUUID()}.owner`;
  writeFileSync(temporary, JSON.stringify(owner));
  try {
    linkSync(temporary, path);
    return true;
  } catch (error) {
    if (isErrorCode(error, "EEXIST")) return false;
    throw error;
  } finally {
    unlinkSync(temporary);
  }
}

function readOwner(path: string): NativeBuildLockOwner | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    // Missing (released meanwhile) or a directory (a lock without an owner record): no provable owner.
    if (isErrorCode(error, "ENOENT") || isErrorCode(error, "EISDIR")) return undefined;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const { token, pid, host, start } = parsed;
  return typeof token === "string" && typeof pid === "number" && Number.isInteger(pid) && pid > 0 &&
    typeof host === "string" && (typeof start === "string" || start === null)
    ? Object.freeze({ token, pid, host, start })
    : undefined;
}

function removeIfPresent(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!isErrorCode(error, "ENOENT")) throw error;
  }
}

function processStart(pid: number): string | null {
  let stat: string;
  try {
    stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  } catch (error) {
    // No such process, or no /proc on this platform.
    if (isErrorCode(error, "ENOENT")) return null;
    throw error;
  }
  // Fields after the parenthesised command name start at field 3; the start time is field 22.
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  return fields[19] ?? null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
