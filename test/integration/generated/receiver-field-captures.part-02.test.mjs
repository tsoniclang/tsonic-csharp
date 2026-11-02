import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldCapturesSource } from "../../../../tsonic/test/fixtures/receiver-field-captures.mjs";
import { receiverFieldCaptureEdges, receiverFieldFreezeSource, receiverFieldFreezeEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { genericCallableOwnershipCases } from "../../../../tsonic/test/fixtures/generic-callable-ownership.mjs";
import { assertNumericLiteralRefusal, numericCarrierRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

for (const example of Array.from([...receiverFieldCaptureEdges, ...receiverFieldFreezeEdges]).slice(2, 3)) {
for (const surface of Array.from(receiverFieldFreezeEdges.includes(example) ? ["js"] : ["native", "js"]).slice(1, 2)) {
test(`receiver field edge ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
}
}

for (const example of Array.from([...receiverFieldCaptureEdges, ...receiverFieldFreezeEdges]).slice(3, 8)) {
for (const surface of Array.from(receiverFieldFreezeEdges.includes(example) ? ["js"] : ["native", "js"]).slice(0, 2)) {
for (const ownNumber of example.name === "defaults-private-readonly" ? [false, true] : [false]) {
test(ownNumber ? `receiver field edge ${example.name} keeps its own-number storage in ${surface}`
  : `receiver field edge ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: ownNumber
      ? example.source.replace("private value = 2;", "private value: number = 2;") : example.source });
    if (example.name === "defaults-private-readonly" && !ownNumber) {
      assertNumericLiteralRefusal(compiled, [numericCarrierRefusal(csharpSourcePrimitiveTargetType("float64"),
        csharpSourcePrimitiveTargetType("int64"), "value")]);
      return;
    }
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
}
}
}

for (const example of Array.from([...receiverFieldCaptureEdges, ...receiverFieldFreezeEdges]).slice(8, 9)) {
for (const surface of Array.from(receiverFieldFreezeEdges.includes(example) ? ["js"] : ["native", "js"]).slice(0, 1)) {
test(`receiver field edge ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
}
}
