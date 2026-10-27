import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldFreezeEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { inheritedFixture, examples } from "./frozen-native-inheritance.fixtures.mjs";

for (const example of Array.from(examples).slice(0, 8)) {
test(`native frozen inheritance preserves ${example.name}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.equal(/dynamic|Unsafe\.|GetProperty|Activator|WeakReference/u.test(emitted), false,
      "statically closed native owner guards");
    executeCsharpConstruction(compiled, `frozen-native-inheritance-${example.name}`, example.asynchronous);
  });
}
