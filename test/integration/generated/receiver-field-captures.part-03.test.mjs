import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldCapturesSource } from "../../../../tsonic/test/fixtures/receiver-field-captures.mjs";
import { receiverFieldCaptureEdges, receiverFieldFreezeSource, receiverFieldFreezeEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { genericCallableOwnershipCases } from "../../../../tsonic/test/fixtures/generic-callable-ownership.mjs";
import { assertNumericLiteralRefusal, numericCarrierRefusal, numericCompoundRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function numericFieldRefusal(example) {
  if (example.name === "suspended-fields") return [numericCompoundRefusal("+=", "this.value += step")];
  if (example.name === "reentrant-write") return [numericCarrierRefusal(csharpSourcePrimitiveTargetType("float64"),
    csharpSourcePrimitiveTargetType("int64"), "next()")];
  if (example.name === "inherited-identity") return [
    {
      "code": "CSHARP_UNSUPPORTED_AST",
      "message": "No exact C# implicit conversion relates 'source:float64' to 'source:int64'.",
      "text": "next"
    },
    {
      "code": "CSHARP_UNSUPPORTED_AST",
      "message": "No exact C# implicit conversion relates 'target:tsonic.source:/project/index.ts\u0000264\u000087\u0000138<>' to 'target:tsonic.shape:1e4714b9b38764d7b4ada6364e5b5c685696911a5233e595d5cba4163369a303<source:float64>'.",
      "text": "value"
    }
  ];
  return undefined;
}

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
    const refusal = numericFieldRefusal(example);
    if (refusal !== undefined) {
      assertNumericLiteralRefusal(compiled, refusal);
      return;
    }
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
if (numericFieldRefusal(example) !== undefined) test(
  `receiver field edge ${example.name} keeps its own-number storage in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source.replace("value = 1;", "value: number = 1;") });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-own-number-${example.name}`, example.asynchronous);
  });
}
}

for (const example of Array.from([...receiverFieldCaptureEdges, ...receiverFieldFreezeEdges]).slice(13, 19)) {
for (const surface of Array.from(receiverFieldFreezeEdges.includes(example) ? ["js"] : ["native", "js"]).slice(0, 1)) {
test(`receiver field edge ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    const refusal = numericFieldRefusal(example);
    if (refusal !== undefined) {
      assertNumericLiteralRefusal(compiled, refusal);
      return;
    }
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-${example.name}`, example.asynchronous);
  });
if (numericFieldRefusal(example) !== undefined) test(
  `receiver field edge ${example.name} keeps its own-number storage in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source.replace("value = 1;", "value: number = 1;") });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-field-own-number-${example.name}`, example.asynchronous);
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
