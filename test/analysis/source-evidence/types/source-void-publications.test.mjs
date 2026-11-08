import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { getCsharpNullableElementTargetType, csharpNullableTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";
import { isCsharpVoidTargetType } from "../../../../dist/target-model/types/identity.js";
import { getCsharpGenericOptionalParts } from "../../../../dist/target-model/types/projections.js";
import { publishedCallableReturn, resolvedSourceValue } from "../../../helpers/published-return-contracts.mjs";

const sourceText = `
import type { uint64 } from "@tsonic/core/types.js";
declare function wideParameter(value: uint64 | void): void;
declare function genericParameter<Value extends object>(value: Value | void): void;
declare function taskParameter(value: Promise<void> | void): void;
export function wideReturn(value: uint64, take: boolean): uint64 | void { if (take) return value; }
export function genericReturn<Value extends object>(value: Value, take: boolean): Value | void { if (take) return value; }
export function taskReturn(value: Promise<void>, take: boolean): Promise<void> | void { if (take) return value; }
export function wholeVoid(): void {}
export function soleTaskArgument(value: Promise<void>): Promise<void> { return value; }
export function categoryText(value: string): string { return value; }
`;

function fixture() {
  const compiled = analyzeCsharpSource({ sourceText });
  assertCsharpCheckingSucceeded(compiled);
  const diagnostics = compiled.analysis.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join("; ").slice(0, 1600);
  assert.equal(compiled.analysis.kind, "resolved", `the actual Native analysis succeeds: ${diagnostics}`);
  const program = compiled.analysis.value;
  const source = program.source;
  const ast = source.ast;
  const declarations = source.sourceFiles.filter(file => !ast.isDeclarationFile(file))
    .flatMap(file => ast.statements(file)).filter(node => ast.is.IsFunctionDeclaration(node));
  const named = name => {
    const matches = declarations.filter(node => ast.text(ast.name(node)) === name);
    assert.equal(matches.length, 1, `one original declaration ${name}`);
    return matches[0];
  };
  const returned = declaration => {
    const contract = program.records.returnContract.get(declaration);
    assert.equal(contract?.kind, "resolved", "the actual callable has a resolved Native return contract");
    return contract.type;
  };
  const declaredSlot = parameter => {
    const slot = resolvedSourceValue(source.facts.values.declaredSlot(parameter), "original declared parameter slot");
    assert.equal(slot.origin.declaration === parameter, true, "the slot retains the actual authored parameter");
    source.facts.descriptors.assertEvidence(slot.type);
    return slot.type;
  };
  const represented = (evidence, position, site) => {
    const outcome = program.representation.represent(evidence, position, site);
    assert.equal(outcome.kind, "represented", `${position}: ${outcome.code ?? ""} ${outcome.message ?? ""}`.slice(0, 1200));
    assert.equal(outcome.value.evidence === evidence, true, "the real Native view retains the identical Source evidence");
    return outcome.value.carrier;
  };
  return { program, source, ast, named, returned, declaredSlot, represented };
}

test("six genuine void parameter and return contracts preserve exact nullable Native carriers", () => {
  const { source, ast, named, returned, declaredSlot, represented } = fixture();
  const carriers = new Map();
  for (const domain of ["wide", "generic", "task"]) {
    for (const position of ["Parameter", "Return"]) {
      const name = `${domain}${position}`;
      const declaration = named(name);
      const occurrence = position === "Parameter" ? ast.parameters(declaration)[0] : declaration;
      const evidence = position === "Parameter" ? declaredSlot(occurrence) : publishedCallableReturn(source, declaration).publication;
      assert.equal(evidence.type.kind, "optional", `${name}: actual Source void union is optional`);
      assert.equal(evidence.type.value.kind !== "optional" && evidence.type.value.kind !== "union", true, `${name}: one exact present Source payload`);
      const carrier = represented(evidence, position === "Parameter" ? "storage" : "return", occurrence);
      if (position === "Return") assert.equal(targetTypeRefEquals(carrier, returned(declaration)), true, `${name}: independent sealed return consumer agrees`);
      const payload = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier);
      assert.equal(payload !== undefined, true, `${name}: the void arm supplies one native absence layer`);
      assert.equal(getCsharpNullableElementTargetType(payload), undefined, `${name}: no second absence layer`);
      assert.equal(isCsharpVoidTargetType(payload), false, `${name}: System.Void is not a union payload`);
      assert.equal(targetTypeRefEquals(carrier, csharpNullableTargetType(payload)), true, `${name}: exact established nullable representation`);
      if (domain === "wide") {
        assert.equal(targetTypeRefEquals(payload, csharpSourcePrimitiveTargetType("uint64")), true, `${name}: uint64 remains ulong`);
      } else if (domain === "generic") {
        assert.equal(evidence.type.value.kind === "parameter" && evidence.type.value.declaration === ast.typeParameters(declaration)[0], true,
          `${name}: exact original Source binder`);
        assert.equal(payload.kind, "type-parameter", `${name}: original Value carrier`);
        assert.equal(payload.csharpDeclaration === ast.typeParameters(declaration)[0], true, `${name}: original binder identity`);
      } else {
        assert.equal(evidence.type.value.kind === "declared" && evidence.type.value.typeArguments.length === 1 &&
          evidence.type.value.typeArguments[0].kind === "intrinsic" && evidence.type.value.typeArguments[0].intrinsic === "void", true,
        `${name}: Promise keeps its own void completion argument`);
        assert.equal(payload.kind === "target-named" && payload.id === "System.Threading.Tasks.Task", true, `${name}: exact non-generic Task payload`);
        assert.equal(payload.typeArguments?.length ?? 0, 0, `${name}: void completion does not become Task<System.Void>`);
      }
      carriers.set(name, carrier);
    }
  }
  for (const domain of ["wide", "task"]) {
    assert.equal(targetTypeRefEquals(carriers.get(`${domain}Parameter`), carriers.get(`${domain}Return`)), true,
      `${domain}: parameter and return use the same concrete Native carrier`);
  }
});

test("whole void and sole Promise<void> arguments remain completion, not optional unions", () => {
  const { source, ast, named, returned, declaredSlot, represented } = fixture();
  const wholeEvidence = publishedCallableReturn(source, named("wholeVoid")).publication;
  assert.equal(wholeEvidence.type.kind === "intrinsic" && wholeEvidence.type.intrinsic === "void", true, "whole Source void remains completion");
  const whole = returned(named("wholeVoid"));
  assert.equal(isCsharpVoidTargetType(whole), true, "whole void remains native completion");
  assert.equal(getCsharpNullableElementTargetType(whole), undefined, "whole void is not optional");
  const declaration = named("soleTaskArgument");
  const parameterNode = ast.parameters(declaration)[0];
  const parameterEvidence = declaredSlot(parameterNode);
  const resultEvidence = publishedCallableReturn(source, declaration).publication;
  for (const evidence of [parameterEvidence, resultEvidence]) {
    assert.equal(evidence.type.kind === "declared" && evidence.type.typeArguments.length === 1 &&
      evidence.type.typeArguments[0].kind === "intrinsic" && evidence.type.typeArguments[0].intrinsic === "void", true,
    "sole Source void argument never becomes outer absence");
  }
  const parameter = represented(parameterEvidence, "storage", parameterNode);
  const result = returned(declaration);
  for (const [position, carrier] of [["parameter", parameter], ["return", result]]) {
    assert.equal(carrier?.kind === "target-named" && carrier.id === "System.Threading.Tasks.Task", true, `${position}: exact whole Task`);
    assert.equal(carrier.typeArguments?.length ?? 0, 0, `${position}: no System.Void type argument`);
    assert.equal(getCsharpNullableElementTargetType(carrier), undefined, `${position}: sole void type argument does not invent outer absence`);
  }
});

test("the same genuine Source category accepts its carrier and precisely refuses an incompatible physical carrier", () => {
  const { program, ast, named, declaredSlot } = fixture();
  const parameter = ast.parameters(named("categoryText"))[0];
  const evidence = declaredSlot(parameter);
  assert.equal(evidence.type.kind === "string" && evidence.category.kind === "known" && evidence.category.category === "string", true,
    "the actual original parameter publishes its own string category");
  const refused = program.representation.category(evidence, csharpSourcePrimitiveTargetType("int32"), parameter);
  assert.equal(refused.kind, "native-refused", "incompatible native storage is not a Source refusal or a category conversion");
  assert.equal(refused.source, "tsonic-csharp");
  assert.equal(refused.code, "CSHARP_SOURCE_CATEGORY_STORAGE_MISMATCH");
  assert.equal(refused.message, "The authenticated Source category cannot be represented by the actual Native carrier.");
  assert.equal(refused.site === parameter, true, "the precise Native failure retains the original parameter site");
  const carrier = csharpStringTargetType();
  const accepted = program.representation.category(evidence, carrier, parameter);
  assert.equal(accepted.kind, "represented", "the identical Source evidence is accepted by its genuine Native carrier");
  assert.equal(accepted.value.kind === "known" && accepted.value.category === "string", true, "the query retains the published category");
  assert.equal(accepted.value.evidence === evidence && accepted.value.valueType === carrier, true,
    "neither Source evidence nor physical carrier is widened, converted or replaced");
});
