import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { selectCsharpConversion, selectCsharpFlowReadConversion } from "../../../dist/policy/conversions/index.js";
import { planCsharpUnionMapping } from "../../../dist/backend/planner/expressions/union-mappings.js";
import { planCsharpRuntimeUnionProjection } from "../../../dist/backend/planner/expressions/runtime-union-projections.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/render.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const mappingRejected = { kind: "rejected", reason: "Union conversion requires exact sealed arm coverage and native absence correspondence." };
const projectionRejected = { kind: "rejected", reason: "Union projection requires exact sealed payload and absence correspondence." };
const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };

function compiled(sourceText, surface) {
  const result = compileCsharpSource({ sourceText, surface });
  assertCsharpCompilationSucceeded(result);
  const { program } = result.result;
  const nodes = [];
  const pending = [...csharpProgramSourceFiles(program)];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  return { program, nodes, plan: result.result.plan };
}

function returnedMapping(plan, name) {
  const methods = plan.sources.flatMap(source => source.unit.members)
    .flatMap(member => member.kind === "NamespaceDeclaration" ? member.members : [member])
    .filter(type => type.kind === "ClassDeclaration").flatMap(type => type.members)
    .filter(member => member.kind === "MethodDeclaration" && member.name === name);
  assert.equal(methods.length, 1, `one authored ${name} method`);
  const returned = methods[0].body.statements.filter(statement => statement.kind === "ReturnStatement");
  assert.equal(returned.length, 1, `one top-level ${name} return`);
  assert.equal(returned[0].expression?.kind, "SwitchExpression", `${name} returns its admitted native mapping`);
  return returned[0].expression;
}

function assertMappingEmission(plan, name, selection, target, sourceIndexes, targetIndexes, nullable) {
  const emitted = returnedMapping(plan, name);
  assert.deepEqual(emitted.expression, { kind: "IdentifierName", name: "value" });
  assert.deepEqual(selection.arms.map(arm => arm.source.map(step => step.index)), sourceIndexes.map(index => [index]));
  assert.deepEqual(selection.arms.map(arm => arm.target.map(step => step.index)), targetIndexes.map(index => [index]));
  assert.equal(emitted.arms.length, selection.arms.length + (nullable ? 2 : 1), "complete mapped, absence and excluded arms");
  for (const [index, mapping] of selection.arms.entries()) {
    const actual = emitted.arms[index];
    assert.equal(actual.pattern.kind, "VarPattern");
    assert.equal(typeof actual.pattern.designation, "string");
    const receiver = { kind: "IdentifierName", name: actual.pattern.designation };
    const test = { kind: "InvocationExpression", callee: {
      kind: nullable ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression", receiver, name: `Is${sourceIndexes[index] + 1}`,
    }, arguments: [] };
    const payload = { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
      receiver: nullable ? { kind: "SimpleMemberAccessExpression", receiver: {
        kind: "PostfixUnaryExpression", operand: receiver, operatorToken: { kind: "ExclamationToken" },
      }, name: "Value" } : receiver, name: `As${sourceIndexes[index] + 1}` }, arguments: [] };
    const value = { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
      receiver: csharpTypeFromTargetTypeRef(mapping.target[0].union), name: `From${targetIndexes[index] + 1}` },
      arguments: [{ kind: "Argument", expression: payload }] };
    const expected = { pattern: actual.pattern, when: nullable ? { kind: "BinaryExpression", left: test,
      operatorToken: { kind: "EqualsEqualsToken" }, right: { kind: "LiteralExpression", value: true } } : test,
      expression: nullable ? { kind: "CastExpression", type: csharpTypeFromTargetTypeRef(target), expression: value } : value };
    assert.equal(isDeepStrictEqual(actual, expected), true, `${name} arm ${index} emits the exact admitted payload correspondence`);
  }
  if (nullable) assert.equal(isDeepStrictEqual(emitted.arms.at(-2), {
    pattern: { kind: "ConstantPattern", expression: { kind: "LiteralExpression", value: null } },
    expression: { kind: "DefaultExpression", type: csharpTypeFromTargetTypeRef(target) },
  }), true, `${name} preserves the single native absence state`);
  assert.equal(isDeepStrictEqual(emitted.arms.at(-1), { pattern: { kind: "DiscardPattern" }, expression: {
    kind: "ThrowExpression", expression: { kind: "ObjectCreationExpression",
      type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Excluded native union variant" } }],
    },
  } }), true, `${name} keeps the excluded-variant safety check`);
}

function assertCanonicalMapping(selection, coverage) {
  assert.equal(selection.kind, "union-map");
  assert.equal(selection.coverage, coverage);
  assert.deepEqual(Object.keys(selection).sort(), ["arms", "coverage", "kind"], "one canonical mapping shape");
  assert.equal(Object.isFrozen(selection.arms) || Array.isArray(selection.arms), true);
}

for (const surface of ["native", "js"]) {
  test(`conversion analysis publishes admitted union mappings in ${surface}`, () => {
    const { program, nodes, plan } = compiled(`
      export function widen(value: string | number): string | number | boolean { return value; }
    `, surface);
    const returned = nodes.filter(node => program.source.ast.is.IsIdentifier(node) &&
      program.source.ast.text(node) === "value" && program.source.ast.is.IsReturnStatement(program.source.ast.parent(node)));
    assert.equal(returned.length, 1);
    const source = program.records.valueRead.get(returned[0]).value;
    const native = program.records.nativeExpression.get(returned[0])?.use;
    assert.equal(native?.kind === "converted", true, "the actual return has an exact native conversion");
    const target = native.target;
    const selection = program.records.expressionConversion.get(returned[0], source, target, "implicit");
    assertCanonicalMapping(selection, "source");
    assertMappingEmission(plan, "widen", selection, target, [0, 1], [1, 2], false);
  });

  test(`flow-read projections publish admitted union mappings in ${surface}`, () => {
    const { program, nodes, plan } = compiled(`
      export function narrow(value: string | number | boolean | undefined): string | number | undefined {
        if (typeof value === "boolean") return undefined;
        return value;
      }
    `, surface);
    const projections = nodes.map(node => program.records.flowReadProjection.get(node))
      .filter(projection => projection?.kind === "conversion" && projection.selection.kind === "union-map");
    assert.equal(projections.length > 0, true, "the narrowed read is a union mapping");
    for (const projection of projections) assertCanonicalMapping(projection.selection, "target");
    assertMappingEmission(plan, "narrow", projections[0].selection, projections[0].target, [1, 2], [0, 1], true);
  });

  test(`await completions publish one admitted union mapping in ${surface}`, () => {
    const { program, nodes } = compiled(`
      export async function settle(pending: Promise<string | number> | Promise<boolean>): Promise<string | number | boolean> {
        return await pending;
      }
    `, surface);
    const mappings = nodes.flatMap(node => program.records.awaitCompletion.get(node)?.alternatives ?? [])
      .filter(alternative => alternative.resultMapping !== undefined);
    assert.equal(mappings.length, 1, "the union-valued alternative carries its mapping");
    assertCanonicalMapping(mappings[0].resultMapping, "source");
    assert.equal(Object.isFrozen(mappings[0].resultMapping), true);
  });
}

test("admission rejects union mappings whose correspondence does not hold before anything is published", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const string = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const narrow = csharpRuntimeUnionTargetType([string, integer]);
  const wide = csharpRuntimeUnionTargetType([integer, boolean, string]);
  const widening = selectCsharpConversion(policy, narrow, wide, "implicit");
  assert.equal(admitCsharpConversionSelection(policy, narrow, wide, widening), widening, "a valid mapping is admitted unchanged");
  assert.deepEqual(admitCsharpConversionSelection(policy, wide, narrow, widening), mappingRejected);
  assert.deepEqual(admitCsharpConversionSelection(policy, narrow, wide, { ...widening, arms: widening.arms.slice(1) }), mappingRejected);
  assert.deepEqual(admitCsharpConversionSelection(policy, narrow, wide, { ...widening, coverage: "all" }), mappingRejected);
  const narrowing = selectCsharpFlowReadConversion(policy, csharpNullableTargetType(wide), csharpNullableTargetType(narrow));
  assert.equal(admitCsharpConversionSelection(policy, csharpNullableTargetType(wide), csharpNullableTargetType(narrow), narrowing), narrowing);
  assert.deepEqual(admitCsharpConversionSelection(policy, wide, csharpNullableTargetType(narrow), narrowing), mappingRejected,
    "target coverage cannot invent native absence");
});

test("admission rejects runtime union projections whose payload or absence does not correspond", () => {
  const string = csharpStringTargetType();
  const integer = csharpSourcePrimitiveTargetType("int32");
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const source = csharpNullableTargetType(union);
  const target = csharpNullableTargetType(string);
  const selection = { kind: "runtime-union-projection", path: [{ union, index: 1 }], armType: string, retainsAbsence: true };
  assert.equal(admitCsharpConversionSelection(policy, source, target, selection), selection);
  for (const [selectedSource, selectedTarget, selected] of [
    [union, target, selection], [source, string, selection], [source, target, { ...selection, retainsAbsence: false }],
    [source, target, { ...selection, retainsAbsence: undefined }], [source, target, { ...selection, path: [{ union, index: 0 }] }],
    [source, target, { ...selection, armType: integer }], [source, target, { ...selection, path: [{ union, index: "1" }] }],
    [source, target, { ...selection, path: [] }], [source, target, { ...selection, path: new Array(1) }],
  ]) {
    assert.deepEqual(admitCsharpConversionSelection(policy, selectedSource, selectedTarget, selected), projectionRejected);
  }
});

test("planning consumes admitted mappings without a conversion validation service", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const string = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const narrow = csharpRuntimeUnionTargetType([string, integer]);
  const wide = csharpRuntimeUnionTargetType([integer, boolean, string]);
  const widening = selectCsharpConversion(policy, narrow, wide, "implicit");
  const context = { program: { source: { ast: { pos: () => 0, end: () => 5 } }, records: { typeEmission: csharpTypeEmissionRecord() } }, scope: {}, names: { temporaryName: name => name } };
  const diagnostics = [];
  const planned = planCsharpUnionMapping({}, { kind: "IdentifierName", name: "value" }, narrow, wide, widening, context, diagnostics);
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "SwitchExpression");
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const projection = planCsharpRuntimeUnionProjection({}, csharpNullableTargetType(union), csharpNullableTargetType(string),
    { kind: "runtime-union-projection", path: [{ union, index: 1 }], armType: string, retainsAbsence: true },
    { kind: "IdentifierName", name: "value" }, diagnostics, { scope: { typeParameterNames: new Map() }, program: { records: { typeEmission: csharpTypeEmissionRecord() } } });
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(projection.kind, "InvocationExpression");
});
