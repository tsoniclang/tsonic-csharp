import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldCapturesSource } from "../../../../tsonic/test/fixtures/receiver-field-captures.mjs";
import { receiverFieldCaptureEdges, receiverFieldFreezeSource, receiverFieldFreezeEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { genericCallableOwnershipCases } from "../../../../tsonic/test/fixtures/generic-callable-ownership.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`native receiver field owners preserve escaped, inherited, generic and replaced storage in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: receiverFieldCapturesSource +
      '\nexport function main(): void { if (!run()) throw new Error("receiver field owners"); }' });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/dynamic|Unsafe\.|GetProperty|Activator/u.test([...compiled.artifacts.values()].join("\n")), false);
    executeCsharpConstruction(compiled, `receiver-field-captures-${surface}`);
  });
}

test("retained receiver field writes preserve the selected object's freeze identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: receiverFieldFreezeSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "receiver-field-freeze");
});

for (const example of Array.from([...receiverFieldCaptureEdges, ...receiverFieldFreezeEdges]).slice(0, 2)) {
for (const surface of Array.from(receiverFieldFreezeEdges.includes(example) ? ["js"] : ["native", "js"]).slice(0, 2)) {
test(`receiver field edge ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
}
}

for (const example of Array.from([...receiverFieldCaptureEdges, ...receiverFieldFreezeEdges]).slice(2, 3)) {
for (const surface of Array.from(receiverFieldFreezeEdges.includes(example) ? ["js"] : ["native", "js"]).slice(0, 1)) {
test(`receiver field edge ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
}
}
