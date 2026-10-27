import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldCapturesSource } from "../../../../tsonic/test/fixtures/receiver-field-captures.mjs";
import { receiverFieldCaptureEdges, receiverFieldFreezeSource, receiverFieldFreezeEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { genericCallableOwnershipCases } from "../../../../tsonic/test/fixtures/generic-callable-ownership.mjs";

for (const example of Array.from([...receiverFieldCaptureEdges, ...receiverFieldFreezeEdges]).slice(8, 9)) {
for (const surface of Array.from(receiverFieldFreezeEdges.includes(example) ? ["js"] : ["native", "js"]).slice(1, 2)) {
test(`receiver field edge ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
}
}

for (const example of Array.from([...receiverFieldCaptureEdges, ...receiverFieldFreezeEdges]).slice(9, 13)) {
for (const surface of Array.from(receiverFieldFreezeEdges.includes(example) ? ["js"] : ["native", "js"]).slice(0, 2)) {
test(`receiver field edge ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
}
}

for (const example of Array.from([...receiverFieldCaptureEdges, ...receiverFieldFreezeEdges]).slice(13, 19)) {
for (const surface of Array.from(receiverFieldFreezeEdges.includes(example) ? ["js"] : ["native", "js"]).slice(0, 1)) {
test(`receiver field edge ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
}
}

for (const example of Array.from(genericCallableOwnershipCases).slice(0, 2)) {
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

for (const example of Array.from(genericCallableOwnershipCases).slice(2, 3)) {
for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
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
