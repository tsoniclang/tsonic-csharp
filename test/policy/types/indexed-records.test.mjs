import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`indexed records reject incompatible keys and readonly mutation on ${surface ?? "native"}`, () => {
    for (const sourceText of [
      'export function read(record: Record<string, string>, key: number): string { return record[key]; }',
      'export function remove(record: Readonly<Record<string, string>>): void { delete record["key"]; }',
    ]) {
      const compiled = compileCsharpSource({ surface, sourceText });
      assert.ok(compiled.targetDiagnostics.some(diagnostic => /index|deletion/i.test(diagnostic.message)),
        JSON.stringify(compiled.targetDiagnostics));
      assert.equal(compiled.artifacts.size, 0);
    }
  });
  test(`indexed record aliasing, absence and native integers on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files: { "records.ts": `
      export function read<Value>(record: Record<string, Value | undefined>, key: string): Value | undefined {
        return record[key];
      }
      export function one<Value>(value: Value): Record<string, Value> { return { first: value }; }
      export function copy<Value>(record: Record<string, Value>): Record<string, Value> { return { ...record }; }
      export function change(record: Record<string, string | undefined>): string {
        record["present"] = "after";
        return "last";
      }
      function nextKey(calls: Record<string, number>): string { calls["count"]++; return "present"; }
      export function countCalls(calls: Record<string, number>): number { return calls["count"]; }
      export function optionalRead(record: Record<string, string | undefined> | undefined, calls: Record<string, number>): string | undefined {
        return record?.[nextKey(calls)];
      }
    ` }, sourceText: `
      import type { uint64 } from "@tsonic/core/types.js";
      import { read, one, copy, change, optionalRead, countCalls } from "./records.js";
      export function run(): boolean {
        const values: Record<string, uint64> = { first: 9007199254740993n };
        const alias = values;
        alias["second"] = 9007199254740994n;
        values["first"] += 1n;
        const previous = values["first"]++;
        if (previous !== 9007199254740994n || alias["first"] !== 9007199254740995n
          || values["second"] !== 9007199254740994n) return false;
        const optional: Record<string, string | undefined> = { present: "yes", absent: undefined };
        if (read(optional, "present") !== "yes" || read(optional, "absent") !== undefined
          || read(optional, "missing") !== undefined) return false;
        const snapshot: Record<string, string | undefined> = { ...optional, present: "changed" };
        if (snapshot["present"] !== "changed" || optional["present"] !== "yes") return false;
        const ordered: Record<string, string | undefined> = { ...optional, final: change(optional) };
        if (ordered["present"] !== "yes" || ordered["final"] !== "last" || read(optional, "present") !== "after") return false;
        const replaced: Record<string, string | undefined> = { present: "before", ...optional };
        if (replaced["present"] !== "after") return false;
        const layered: Record<string, string | undefined> = { ...snapshot, ...optional, present: "last", extra: undefined };
        if (read(layered, "present") !== "last" || read(layered, "extra") !== undefined) return false;
        const calls: Record<string, number> = { count: 0 };
        if (optionalRead(undefined, calls) !== undefined || countCalls(calls) !== 0) return false;
        if (optionalRead(optional, calls) !== "after" || countCalls(calls) !== 1) return false;
        let native: uint64 = 9007199254740993n;
        native += 2n;
        native -= 1n;
        if (native !== 9007199254740994n) return false;
        let count = 0;
        for (const key in values) { if (values[key] > 9007199254740992n) count++; }
        return count === 2 && copy(one("generic"))["first"] === "generic";
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `indexed-records-${surface ?? "native"}`);
  });
}

test("Object operations retain native indexed storage and requested dense results", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    function list<Value>(values: Record<string, Value>): Value[] { return Object.values(values); }
    export function run(): boolean {
      const values: Record<string, string | undefined> = { one: "value" };
      const source: Record<string, string | undefined> = { two: undefined };
      if (Object.keys(values).length !== 1 || Object.values(values)[0] !== "value"
        || list(values)[0] !== "value" || Object.entries(values)[0]![0] !== "one"
        || !Object.hasOwn(values, "one") || Object.hasOwn(values, "two")) return false;
      const result = Object.assign(values, source);
      if (result !== values || !Object.hasOwn(result, "two")) return false;
      delete values["one"];
      return !Object.hasOwn(values, "one") && values["one"] === undefined;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "indexed-object-api");
});
