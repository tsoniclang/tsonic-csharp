import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { acquireNativeBuildLock, nativeBuildLockOwnerGone } from "../../../../dist/providers/native/acquisition/build-lock.js";

const root = () => mkdtempSync(fileURLToPath(new URL("../../../../.temp/native-build-lock-", import.meta.url)));
function ownStart() {
  const stat = readFileSync(`/proc/${process.pid}/stat`, "utf8");
  return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
}

function exitedPid() {
  const child = spawnSync(process.execPath, ["-e", ""]);
  assert.equal(child.status, 0);
  return child.pid;
}

function writeOwner(path, owner) {
  writeFileSync(path, JSON.stringify(owner));
}

test("a lock records its owner and its release leaves no lock files", () => {
  const directory = root();
  const path = join(directory, "runtime.csproj.metadata.lock");
  const lock = acquireNativeBuildLock(path, 1_000);
  assert.equal(lock.kind, "held");
  const owner = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(owner.pid, process.pid);
  assert.equal(owner.host, hostname());
  assert.equal(owner.start, ownStart());
  assert.equal(typeof owner.token, "string");
  lock.release();
  assert.deepEqual(readdirSync(directory), []);
});

test("a live owner keeps its lock: the waiter times out and the record is untouched", () => {
  const directory = root();
  const path = join(directory, "runtime.csproj.metadata.lock");
  const held = acquireNativeBuildLock(path, 1_000);
  assert.equal(held.kind, "held");
  const record = readFileSync(path, "utf8");
  const waiter = acquireNativeBuildLock(path, 200);
  assert.equal(waiter.kind, "busy");
  assert.equal(waiter.owner.pid, process.pid);
  assert.equal(readFileSync(path, "utf8"), record);
  held.release();
});

test("a lock stranded by an exited owner on this host is taken over and released with its stale record", () => {
  const directory = root();
  const path = join(directory, "runtime.csproj.metadata.lock");
  const stale = { token: "stale-owner", pid: exitedPid(), host: hostname(), start: "1" };
  writeOwner(path, stale);
  assert.equal(nativeBuildLockOwnerGone(stale), true);
  const lock = acquireNativeBuildLock(path, 1_000);
  assert.equal(lock.kind, "held");
  const takeover = JSON.parse(readFileSync(`${path}.after-stale-owner`, "utf8"));
  assert.equal(takeover.pid, process.pid);
  const second = acquireNativeBuildLock(path, 200);
  assert.equal(second.kind, "busy", "the takeover is exclusive while its holder lives");
  assert.equal(second.owner.pid, process.pid);
  lock.release();
  assert.deepEqual(readdirSync(directory), []);
});

test("a chain of exited owners is followed to the first free takeover link", () => {
  const directory = root();
  const path = join(directory, "runtime.csproj.metadata.lock");
  writeOwner(path, { token: "first", pid: exitedPid(), host: hostname(), start: null });
  writeOwner(`${path}.after-first`, { token: "second", pid: exitedPid(), host: hostname(), start: null });
  const lock = acquireNativeBuildLock(path, 1_000);
  assert.equal(lock.kind, "held");
  assert.equal(JSON.parse(readFileSync(`${path}.after-second`, "utf8")).pid, process.pid);
  lock.release();
  assert.deepEqual(readdirSync(directory), []);
});

test("a reused pid is proven gone only by a different process start time", () => {
  const start = ownStart();
  assert.equal(nativeBuildLockOwnerGone({ token: "t", pid: process.pid, host: hostname(), start }), false);
  assert.equal(nativeBuildLockOwnerGone({ token: "t", pid: process.pid, host: hostname(), start: `${start}0` }), true);
  assert.equal(nativeBuildLockOwnerGone({ token: "t", pid: process.pid, host: hostname(), start: null }), false);
});

test("owners that cannot be proven gone keep their lock", () => {
  for (const [name, prepare] of [
    ["another host", path => writeOwner(path, { token: "remote", pid: exitedPid(), host: `${hostname()}.other`, start: null })],
    ["no owner record", path => mkdirSync(path)],
    ["an unparseable record", path => writeFileSync(path, "{")],
  ]) {
    const directory = root();
    const path = join(directory, "runtime.csproj.metadata.lock");
    prepare(path);
    const before = readdirSync(directory);
    const lock = acquireNativeBuildLock(path, 200);
    assert.equal(lock.kind, "busy", name);
    assert.deepEqual(readdirSync(directory), before, name);
    assert.equal(existsSync(path), true, name);
  }
});
