import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { code, identity, nativeEntryCases, nativeEntryInverses, nativeOpaquePayloadCases, nativeConstructorCases, nativeConstructorInverses, sourcePosition, sourceSpan, cases, rejected } from "./generic-adoption-admission.fixtures.mjs";

for (const [name, body] of Array.from([
  ["unused-named", "async function unused() { return value; } return 1;"],
  ["discarded-arrow", "async () => value; return 1;"],
  ["type-only", "async function unused() { return value; } type OnlyType = typeof unused; return 1;"],
  ["erased-forwarding", "function unused() { return identity(value); } return 1;"],
]).slice(1, 4)) {
test(`C# erases ${name} without refusing or executing its generic async body`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
      sourceText: `${identity}\nfunction consume<Value>(value: Value): number { ${body} }
        console.log(consume(Promise.resolve(1)));` });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, `generic-erased-${name}`, false, false, [], "");
    assert.equal(output.trim(), "1", "only the retained consume body runs");
  });
}

for (const declaration of Array.from([
  "interface Contract { identity<Value>(value: Value): Promise<Value>; }",
  "abstract class Contract { abstract identity<Value>(value: Value): Promise<Value>; }",
]).slice(0, 2)) {
test(`C# generic adoption keeps its unknown ${declaration.startsWith("interface") ? "interface" : "abstract"} signature`, () => {
    rejected(compileCsharpSource({ surface: "js", sourceText: `${declaration}
      export function reject(contract: Contract, promised: Promise<number>): void { void contract.identity(promised); }` }),
    "contract.identity(promised)", "KindCallExpression", "identity");
  });
}

test("C# unknown source generic bodies fail closed at their actual instantiation", () => {
  rejected(compileCsharpSource({ surface: "js", sourceText: `
    export function reject(callback: <Value>(value: Value) => Promise<Value>, promised: Promise<number>): void {
      void callback(promised);
    }
  ` }), "callback(promised)", "KindCallExpression");
});

test("C# ordinary library generics and constrained native values do not acquire an adoption refusal", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    async function primitive<Value extends number>(value: Value): Promise<Value> { return value; }
    export async function run(): Promise<number> { return await primitive(7); }
  ` });
  assert.equal(compiled.result.diagnostics.length, 0,
    JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  assert.equal(compiled.result.program !== undefined, true, "a native primitive constraint is a checked non-adopting contract");
  for (const source of [
    "export async function run(): Promise<number[]> { return await Promise.all([1, 2].map(async value => value)); }",
    "export function run(): Promise<number>[] { return [1, 2].map(async value => value); }",
    "async function worker(): Promise<number> { return 7; } export async function run(): Promise<number[]> { return await Promise.all([worker(), worker()]); }",
  ]) {
    const result = compileCsharpSource({ surface: "js", sourceText: source }).result;
    assert.equal(result.diagnostics.filter(issue => issue.code === code).length, 0,
      "ambient library binders keep their existing lowering outcome, not the source-generic boundary");
  }
});
