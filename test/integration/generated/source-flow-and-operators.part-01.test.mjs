import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { structuralMethodRestSource, receiverBoundMethodRestSource } from "../../../../tsonic/test/fixtures/structural-method-rest.mjs";
import { compoundIndexedWriteSource } from "../../../../tsonic/test/fixtures/compound-indexed-write.mjs";
import { bigintOperatorSource } from "../../../../tsonic/test/fixtures/bigint-operators.mjs";
import { jsNumericPropertySource } from "../../../../tsonic/test/fixtures/js-numeric-properties.mjs";
import { flowClassReadSource } from "../../../../tsonic/test/fixtures/flow-class-reads.mjs";
import { referenceDefaultSource } from "../../../../tsonic/test/fixtures/reference-defaults.mjs";
import { structuralEnumerationSource } from "../../../../tsonic/test/fixtures/structural-enumeration.mjs";
import { nativeNodeSpawnSource, incompatibleNodeStdioSource } from "../../../../tsonic/test/fixtures/native-node-spawn.mjs";
import { nullishMemberStorageSource } from "../../../../tsonic/test/fixtures/nullish-member-storage.mjs";
import { contextualClassArgumentsSource } from "../../../../tsonic/test/fixtures/contextual-class-arguments.mjs";
import { classUnionUpcastSource, anonymousClassUnionUpcastSource } from "../../../../tsonic/test/fixtures/class-union-upcasts.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";

test("shared mutable arrays cannot silently widen their native element storage", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()],
    sourceText: incompatibleNodeStdioSource });
  assert.equal(compiled.artifacts.size, 0);
  assert.ok(compiled.result.diagnostics.some(diagnostic => diagnostic.category === "error"));
});

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
  const sourceText = `
      function sum(...values: number[]): number {
        let total = 0;
        for (const value of values) total += value;
        return total;
      }
      function forward(values: number[]): number { return sum(...values); }
      export function run(): boolean {
        const values = [2, 3];
        const callable: (...values: number[]) => number = sum;
        return sum() === 0 && sum(1, 2, 3) === 6 && forward(values) === 5 &&
          sum(1, ...values, 4) === 10 && callable() === 0 && callable(1, 2) === 3 &&
          callable(...values) === 5 && callable(1, ...values) === 6;
      }
    `;
  test(`source rest arguments preserve native expansion and direct sequence transport (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const original = compileCsharpNativeUseSource({ surface, sourceText });
    assert.equal(original.sourceDiagnosticsText, "");
    const expected = surface === "js"
      ? "No exact C# implicit conversion relates 'target:Tsonic.CSharp.Js.JSArray`1<source:int64>' to 'target:Tsonic.CSharp.Js.JSArray`1<source:float64>'."
      : "No exact C# implicit conversion relates 'array:1:source:int64' to 'array:1:source:float64'.";
    const ast = original.nativeStage.source.ast;
    const positions = original.nativeStage.diagnostics.map(issue => {
      const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
      const source = issue.sourceNode === undefined ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode));
      assert.equal(issue.code === "CSHARP_UNSUPPORTED_AST" && issue.message === expected &&
        range?.kind === "authored" && source.slice(range.start, range.end) === "values", true,
        "each original rest mismatch names both exact native carriers at the original array argument");
      return range?.kind === "authored" ? range.start : undefined;
    });
    assert.equal(positions.length === 4 && new Set(positions).size === 4, true,
      "all four original direct/spread/delegate boundaries are independently refused, not omitted or duplicated");
    assert.equal(original.result.program === undefined && original.artifacts.size === 0, true,
      "incompatible native arrays are never copied, silently widened or emitted with a fabricated conversion");
  });
  for (const [variant, supportedSource] of [
      ["declared", sourceText.replace("const values = [2, 3];", "const values: number[] = [2, 3];")],
      ["written", sourceText.replace("const values = [2, 3];", "const values = [2.0, 3.0];")],
    ]) test(`${variant} floating rest arguments preserve native expansion and direct sequence transport (${surface ?? "native"})`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: supportedSource });
      executeCsharpConstruction(compiled, `native-rest-boundary-${variant}-${surface ?? "native"}`);
      const source = compiled.artifacts.get("src/Index.cs");
      assert.match(source, /sum\(1L, 2L, 3L\)/u);
      assert.match(source, /return global::Tsonic\.Generated\.Index\.sum\(values\);/u);
      assert.doesNotMatch(source, /sum\(\[\.\. values\]\)/u);
    });
}

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
test(`dense destructuring defaults preserve explicit absence, null and lazy evaluation (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: `
      import { Exception } from "@tsonic/dotnet/System.js";
      let calls = 0;
      function fallback(): number { calls += 1; return calls; }
      function countCalls(): number { return calls; }
      export function run(): boolean {
        const values: (number | undefined)[] = [undefined, 5];
        const [first = fallback(), second = fallback(), missing = fallback()] = values;
        if (first !== 1 || second !== 5 || missing !== 2 || countCalls() !== 2) throw new Exception("binding defaults");
        let assigned = 0;
        [assigned = fallback()] = values;
        if (assigned !== 3 || countCalls() !== 3) throw new Exception("assignment defaults");
        const nullable: (number | null)[] = [null];
        const [retained = fallback()] = nullable;
        if (retained !== 4 || countCalls() !== 4) throw new Exception("native absence default");
        const absent: undefined[] = [undefined];
        const [selected = 4] = absent;
        if (selected !== 4) throw new Exception("undefined-only default");
        return true;
      }
    ` }), `dense-defaults-${surface ?? "native"}`);
  });
}

test("array defaults consume the one native absence", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
    function read(values: (number | null | undefined)[]): number | null {
      const [value = 4] = values;
      return value;
    }
    export function run(): boolean {
      return read([null]) === 4 && read([undefined]) === 4 && read([0]) === 0 && read([]) === 4;
    }
  ` }), "native-array-absence-default");
});

test("optional receiver temporaries cannot collide with authored locals", { timeout: 300_000 }, () => {
  const prefix = "function normalize(value: string | undefined): string | undefined { const result = value?.trim();";
  const entry = 'export function run(): boolean { return normalize(" x ") === "x" && normalize(undefined) === undefined; }';
  const initial = compileCsharpSource({ surface: "js", sourceText: `${prefix} return result; } ${entry}` });
  assertCsharpCompilationSucceeded(initial);
  const preferred = [...initial.artifacts.values()].join("\n").match(/\bvalue is string (__tsonic_present_[0-9]+)\b/)?.[1];
  assert.ok(preferred);
  const compiled = compileCsharpSource({ surface: "js", sourceText:
    `${prefix} const ${preferred} = "authored"; if (${preferred} !== "authored") throw new Error("collision"); return result; } ${entry}`,
  });
  executeCsharpConstruction(compiled, "optional-receiver-name-collision");
  assert.ok([...compiled.artifacts.values()].join("\n").includes(`value is string _${preferred}`));
});

test("optional static calls do not invent a missing receiver region", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
interface Box { value: string; }
export function normalize(box: Box | undefined): string | undefined {
  return box?.value.trim()?.toLowerCase();
}` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.ok(compiled.result.diagnostics.some(diagnostic =>
    diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
    diagnostic.message.includes("originating receiver guard")));
});

test("Node spawn preserves binary views, option aliases, child environment and failures", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeNodeSpawnSource(process.execPath) });
  executeCsharpConstruction(compiled, "native-node-spawn", false, false, [
    join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
  ]);
});

for (const surface of Array.from([undefined, "js"]).slice(0, 1)) {
for (const [name, sourceText] of Array.from([["generic", classUnionUpcastSource], ["anonymous", anonymousClassUnionUpcastSource]]).slice(0, 2)) {
test(`class union upcasts preserve ${name} base identity (${surface ?? "native"})`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText });
      executeCsharpConstruction(compiled, `class-union-upcasts-${surface ?? "native"}`);
      const output = [...compiled.artifacts.values()].join("\n");
      assert.match(output, /\.AsReference</);
      assert.doesNotMatch(output, /\.Match</);
    });
}


test(`required nullish members retain exact storage (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: nullishMemberStorageSource });
    executeCsharpConstruction(compiled, `nullish-member-storage-${surface ?? "native"}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /this\.value = default\(object\?\);/);
    assert.match(output, /this\.missing = default\(object\?\);/);
    assert.doesNotMatch(output, /Runtime\.(?:Null|Undefined)/);
    assert.doesNotMatch(output, /ApplyDynamicBinaryBoolean/);
  });
}
