import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldCapturesSource } from "../../../../tsonic/test/fixtures/receiver-field-captures.mjs";
import { receiverFieldCaptureEdges, receiverFieldFreezeSource, receiverFieldFreezeEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { genericCallableOwnershipCases } from "../../../../tsonic/test/fixtures/generic-callable-ownership.mjs";

for (const example of Array.from(genericCallableOwnershipCases).slice(2, 3)) {
for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
test(`quantified callable ownership ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/\bdynamic\b|System\.Object|Unsafe\.|Activator/u.test([...compiled.artifacts.values()].join("\n")), false,
      `exact native quantified ownership ${example.name}`);
    executeCsharpConstruction(compiled, `generic-callable-${example.name}-${surface}`,
      false, false, [], "Tsonic.Generated.Index.main();");
  });
}
}

for (const example of Array.from(genericCallableOwnershipCases).slice(3, 9)) {
for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`quantified callable ownership ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/\bdynamic\b|System\.Object|Unsafe\.|Activator/u.test([...compiled.artifacts.values()].join("\n")), false,
      `exact native quantified ownership ${example.name}`);
    executeCsharpConstruction(compiled, `generic-callable-${example.name}-${surface}`,
      false, false, [], "Tsonic.Generated.Index.main();");
  });
}
}
