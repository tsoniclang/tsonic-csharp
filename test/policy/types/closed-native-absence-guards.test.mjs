import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { closedNativeAbsenceGuardPolicySource } from "../../../../tsonic/test/fixtures/closed-native-absence-guards.mjs";
import { selectCsharpNativeGuardResult } from "../../../dist/analysis/source-evidence/types/resolution/native-flow-refinement.js";
import { csharpAbsenceTargetType, csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { selectCsharpStructuralObjectCarrier } from "../../../dist/policy/types/objects/shape-carriers.js";
import { isCsharpJsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

test("absence folding requires native absence admission, not an object runtime category", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": closedNativeAbsenceGuardPolicySource,
  }, compilerOptions: { strict: true, module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const context = { ast: source.ast, navigation: source.navigation, sourceFacts: source.sourceFacts,
    semanticsFor: node => source.semantics.forNode(node) };
  const expressions = [];
  const visit = node => {
    if (source.ast.is.IsIfStatement(node)) expressions.push(source.ast.as.AsIfStatement(node).Expression);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(checked.getSourceFile("/src/index.ts"));
  assert.equal(expressions.length, 4);
  const value = csharpTsValueTargetType();
  const shaped = csharpNullableTargetType(csharpTargetNamedType("closed-record", undefined,
    { kind: "named", name: "Payload" }, { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" }));
  for (const carrier of [value, shaped, csharpNullableTargetType(csharpSourcePrimitiveTargetType("int64"))]) {
    assert.deepEqual(expressions.map(expression => selectCsharpNativeGuardResult(context, expression, () => carrier)),
      [undefined, undefined, undefined, undefined]);
  }
  assert.deepEqual(expressions.map(expression => selectCsharpNativeGuardResult(context, expression,
    () => csharpAbsenceTargetType())), [true, false, true, false]);
  assert.deepEqual(expressions.map(expression => selectCsharpNativeGuardResult(context, expression,
    () => csharpSourcePrimitiveTargetType("int64"))), [false, true, false, true]);
});

test("closed unknown-valued fields retain native structural storage and native absence", () => {
  const field = { sourceName: "value", targetName: "value", sourceKey: { kind: "property", name: "value" },
    memberKind: "property", type: csharpTsValueTargetType() };
  for (const contract of [false, true]) {
    const carrier = selectCsharpStructuralObjectCarrier([field], [], [], contract, undefined);
    assert.equal(carrier.kind === "target-named" && carrier.csharpRender?.kind === "named", true,
      "a closed native field inventory owns its real native declaration");
    assert.equal(isCsharpJsValueTargetType(carrier), false, "a scalar unknown field does not erase its containing object");
    assert.equal(carrier.csharpStructuralContract === true, contract, "native interfaces and implementations stay distinct");
    assert.equal(carrier.csharpAbsorbsNullish === undefined && carrier.csharpJsValueCarrier === undefined, true,
      "native references never inherit the scalar closed-value absence ABI");
    assert.equal(csharpNullableTargetType(carrier).csharpNullableReference === true, true,
      "source absence uses the same native nullable reference, not a manufactured runtime tag");
    assert.equal(Object.hasOwn(carrier, "csharpJsObjectShape"), false, "the removed pseudo representation is not published");
  }
});
