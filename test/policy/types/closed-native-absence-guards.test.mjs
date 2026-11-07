// Native absence guard folding (nextgen C-2542). The fold is the target-only query nativeGuardResult
// (analysis/source-evidence/type-queries.ts): a guard folds exactly when the Host test relation of the guard
// (facts.relations.at, kind "test") carries a decided outcome ("always-true" / "always-false"); the Host decides it for
// every value the operand can hold. C# never folds from a carrier, an object runtime category, or the arms a test
// selects: an undecided Host test keeps its runtime test. Basis: plan §2 I2/R2 (a fold is a Source decision), the
// Host test-relation contract (facts.ts SourceUnionRelation "test", outcome), AGENT-C4-NOTES C4-D4.
import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpSourceEvidenceTypeQueries } from "../../../dist/analysis/source-evidence/type-queries.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { selectCsharpStructuralObjectCarrier } from "../../../dist/policy/types/objects/shape-carriers.js";
import { isCsharpJsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";

const guards = parameter => `
function equal_${parameter.name}(value: ${parameter.type}): void { if (value === undefined) return; }
function different_${parameter.name}(value: ${parameter.type}): void { if (value !== undefined) return; }
function reverseEqual_${parameter.name}(value: ${parameter.type}): void { if (null === value) return; }
function reverseDifferent_${parameter.name}(value: ${parameter.type}): void { if (null !== value) return; }
`;

const fold = relation => relation?.kind !== "test" || relation.outcome === "undecided" ? undefined : relation.outcome === "always-true";

test("absence folding follows the Host test outcome, not a native carrier, an object category or the selected arms", () => {
  const parameters = [
    { name: "unknown", type: "unknown", expected: [undefined, undefined, undefined, undefined] },
    { name: "absent", type: "undefined" },
    { name: "scalar", type: "int64" },
    { name: "payload", type: "Payload | undefined", expected: [undefined, undefined, undefined, undefined] },
    { name: "optional", type: "int64 | undefined", expected: [undefined, undefined, undefined, undefined] },
    { name: "present", type: "int64 | string", expected: [false, true, false, true] },
  ];
  const program = hostProgram(`import type { int64 } from "@tsonic/core/types.js";
export class Payload { value: int64 = 0n; }
${parameters.map(guards).join("")}`);
  const unused = new Proxy({}, { get: (_target, key) => () => assert.fail(`guard folding reads no ${String(key)}`) });
  const queries = createCsharpSourceEvidenceTypeQueries(representationServices(program), unused);
  const { ast } = program;
  for (const parameter of parameters) {
    const expressions = ["equal", "different", "reverseEqual", "reverseDifferent"].map(form => {
      const declaration = program.named(`${form}_${parameter.name}`);
      const condition = program.nodes.find(node => ast.is.IsIfStatement(node) && ast.getSourceFile(node) === ast.getSourceFile(declaration) &&
        ast.pos(node) >= ast.pos(declaration) && ast.end(node) <= ast.end(declaration));
      return ast.as.AsIfStatement(condition).Expression;
    });
    const relations = expressions.map(expression => program.facts.relations.at(expression));
    assert.deepEqual(expressions.map(expression => queries.nativeGuardResult(expression)), relations.map(fold),
      `${parameter.type}: C# folds exactly the decided Host outcomes`);
    if (parameter.expected !== undefined) {
      assert.deepEqual(expressions.map(expression => queries.nativeGuardResult(expression)), parameter.expected, parameter.type);
    }
    if (parameter.name === "present") {
      assert.deepEqual(relations.map(relation => relation?.kind === "test" ? relation.whenTrue.length : "none"), [0, 2, 0, 2],
        "the Host test relation selects no arm for === undefined/null and both arms for !== (A11: null and undefined are absence)");
    }
  }
});

test("an undecided Host test is never folded from its arms; a decided one folds through negation", () => {
  const program = hostProgram(`import type { int64 } from "@tsonic/core/types.js";
export function guarded(value: int64 | string): void { if (!(value !== undefined)) return; }`);
  const { ast } = program;
  const condition = ast.as.AsIfStatement(program.nodes.find(node => ast.is.IsIfStatement(node))).Expression;
  const tested = program.nodes.find(node => ast.is.IsBinaryExpression(node));
  const sum = program.facts.relations.at(tested)?.sum;
  const withRelation = relation => createCsharpSourceEvidenceTypeQueries(representationServices(program, {
    facts: Object.freeze({ ...program.facts, relations: Object.freeze({ at: node => node === tested ? relation : program.facts.relations.at(node) }) }),
  }), {});
  const test_ = outcome => Object.freeze({ kind: "test", use: tested, operand: tested, test: "nullish", outcome, sum, whenTrue: Object.freeze([0, 1]) });
  assert.equal(withRelation(test_("undecided")).nativeGuardResult(condition), undefined,
    "every arm selected is not a decided outcome; C# does not fold from arms");
  assert.equal(withRelation(test_("always-true")).nativeGuardResult(condition), false, "a decided true test under ! folds to false");
  assert.equal(withRelation(test_("always-false")).nativeGuardResult(condition), true, "a decided false test under ! folds to true");
  assert.equal(withRelation(undefined).nativeGuardResult(condition), undefined, "no Host test relation, no fold");
});

test("the guarded carriers are the represented Host descriptors (TsValue, nullable int64)", () => {
  const program = hostProgram(`import type { int64 } from "@tsonic/core/types.js";
export function broad(value: unknown): void { if (value === undefined) return; }
export function optional(value: int64 | undefined): void { if (value === undefined) return; }
`);
  const represent = representations(representationServices(program));
  const broad = program.ast.parameters(program.named("broad"))[0];
  const optional = program.ast.parameters(program.named("optional"))[0];
  assert.deepEqual(program.slot(broad), { kind: "intrinsic", intrinsic: "unknown" });
  assert.equal(isCsharpJsValueTargetType(represented(represent.slot(broad))), true, "unknown is the broad TsValue carrier");
  assert.deepEqual(program.sum(program.slot(optional)).arms.map(arm => arm.type.kind === "intrinsic" ? arm.type.intrinsic : arm.type.primitive),
    ["int64", "absence"], "the Host sum keeps the authored order with the absence arm (A11, C-2459)");
  assert.equal(targetTypeRefEquals(represented(represent.slot(optional)),
    csharpNullableTargetType(csharpSourcePrimitiveTargetType("int64"))), true, "int64 | undefined is long?");
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
