import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramPromiseResults } from "../../helpers/program-source-files.mjs";

const cases = [
  ["qualified-owned-field-read", `
import type { int64 } from "@tsonic/core/types.js";
class Counter {
  constructor(public total: int64) {}
  async read(pending: Promise<void>): Promise<int64> {
    await pending;
    return this.total;
  }
}
export async function run(): Promise<boolean> {
  const value: int64 = 9007199254740993n;
  const owner = new Counter(value);
  const pending = owner.read(Promise.resolve(undefined));
  return await pending === value && owner.total === value;
}`],
  ["owned-capture", `
async function keep(value: number, pending: Promise<void>): Promise<number> {
  const read = () => value;
  await pending;
  return read();
}
export async function run(): Promise<boolean> {
  const stored = keep(7, Promise.resolve(undefined));
  return await stored === 7;
}`],
  ["forward-native-callback", `
export function forward<Value>(callback: () => Promise<Value>): Promise<Value> { return callback(); }
export async function invoke<Value>(callback: () => Promise<Value>): Promise<Value> {
  return await forward(callback);
}
async function read(): Promise<number> { return 7; }
export async function run(): Promise<boolean> { return await invoke(read) === 7; }
`],
  ["optional-native-callback", `
function fail(): never { throw new Error("absent"); }
async function read(): Promise<number> { return 7; }
export async function call(callback: (() => Promise<number>) | undefined): Promise<number> {
  return await (callback ?? fail())();
}
export async function run(): Promise<boolean> {
  if (await call(read) !== 7) return false;
  try { await call(undefined); return false; } catch { return true; }
}`],
  ["generic-stored-completion", `
export async function source<Value>(callback: () => Promise<Value>): Promise<Value> { return await callback(); }
export function retain<Other>(callback: () => Promise<Other>): Promise<Other> { return source(callback); }
export async function consumer<Actual>(callback: () => Promise<Actual>): Promise<Actual> {
  return await retain(callback);
}
async function read(): Promise<number> { return 7; }
export async function run(): Promise<boolean> { return await consumer(read) === 7; }
`],
  ["recursive-owned-completion", `
async function left(value: number, count: number, pending: Promise<void>): Promise<number> {
  if (count > 0) return await right(value, count - 1, pending);
  await pending; return value;
}
async function right(value: number, count: number, pending: Promise<void>): Promise<number> {
  if (count > 0) return await left(value, count - 1, pending);
  await pending; return value;
}
export async function run(): Promise<boolean> {
  const stored = left(7, 3, Promise.resolve(undefined));
  return await stored === 7;
}`],
  ["class-native-completion", `
class Work {
  completion: Promise<void> = Promise.resolve(undefined);
  async wait(): Promise<void> { await this.completion; }
}
export async function run(): Promise<boolean> { const work = new Work(); await work.wait(); return true; }
`],
  ["exact-int64-native-callback", `
import type { int64 } from "@tsonic/core/types.js";
async function read(value: int64): Promise<int64> { return value; }
export async function invoke(callback: (value: int64) => Promise<int64>, value: int64): Promise<int64> {
  return await callback(value);
}
export async function run(): Promise<boolean> {
  const value: int64 = 9007199254740993n;
  const stored = invoke(read, value);
  return await stored === value;
}`],
];

export { cases };
