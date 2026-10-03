import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { nativeExpressionSequencesSource } from "../../../../../tsonic/test/fixtures/native-expression-sequences.mjs";
import { finiteCompletionSequencingSource } from "../../../helpers/finite-completion-sequencing.mjs";

import { constructorEntrySource } from "../../../helpers/constructor-entry.mjs";

for (const [name, sourceText] of [["constructor entry", constructorEntrySource],
  ["value sequences", nativeExpressionSequencesSource], ["finite completion", finiteCompletionSequencingSource]]) {
  for (const surface of [undefined, "js"]) {
    test(`plan-only ${name} preserves closed native planning on ${surface ?? "native"}`, () => {
      const compiled = compileCsharpSource({ sourceText, surface });
      assertCsharpCompilationSucceeded(compiled);
    });
  }
}

test("constructor entry owns one native preparation, captured identity and a stack value packet", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: constructorEntrySource });
  assertCsharpCompilationSucceeded(compiled);
  const source = [...compiled.artifacts.values()].join("\n");
  assert.match(source, /: this\(__tsonic_constructor_entry/u);
  assert.match(source, /private static .*__tsonic_constructor_entry/u);
  assert.match(source, /global::System\.ValueTuple<int>/u);
  assert.doesNotMatch(source, /Task\.Run|ContinueWith|new .*Func.*constructor_entry|baseArguments/u);
  executeCsharpConstruction(compiled, "planned-constructor-entry");
});

test("default failure preserves exception identity and cannot invoke the native base constructor", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let baseCalls = 0 as int32;
    const failure = new Error("entry");
    function fail(): int32 { throw failure; }
    class Base { constructor(value: int32) { baseCalls += value; } }
    class Derived extends Base { constructor(value: int32 = fail()) { super(value); } }
    export function run(): boolean {
      try { new Derived(); return false; } catch (caught) { return caught === failure && baseCalls === 0; }
    }
  `, surface: "js" });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "planned-constructor-entry-failure");
});

for (const surface of [undefined, "js"]) {
  test(`shared comma completion proof preserves native carriers and effects on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: nativeExpressionSequencesSource, surface });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `planned-comma-regions-${surface ?? "native"}`, true, false, [],
      "await Tsonic.Generated.Index.main();");
  });
}
