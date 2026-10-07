import assert from "node:assert/strict";
import test from "node:test";
import { optionalOverloadedMethodSource, optionalOverloadedBroadMethodSource } from "../../../../tsonic/test/fixtures/optional-overloaded-methods.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  for (const [name, sourceText] of [["string", optionalOverloadedMethodSource], ["broad", optionalOverloadedBroadMethodSource]]) {
    test(`optional overloaded ${name} methods retain selected native calls in ${lane}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText });
      assertCsharpCompilationSucceeded(compiled);
      const emitted = [...compiled.artifacts.values()].join("\n");
      assert.doesNotMatch(emitted, /InvokeDynamic|ReadDynamicSlot/u);
      assert.doesNotMatch(emitted, /\(Func<Derived>\)new Func<Source>/u,
        "the physical delegate must never be relabeled as its narrower source inference");
      executeCsharpConstruction(compiled, `optional-overloaded-${name}-${lane}`);
    });
  }
}

test("optional overloaded calls reject arguments outside every selected signature", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText:
    optionalOverloadedBroadMethodSource + '\nexport function rejected(source: Source | undefined): unknown { return source?.read(true); }' });
  assert.match(compiled.sourceDiagnosticsText, /TS2769/u);
  assert.equal(compiled.result.artifacts.length, 0);
});
