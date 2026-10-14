import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { admitCsharpUnionSelection } from "../../../dist/analysis/conversions/validation.js";
import { selectCsharpConversion, selectCsharpFlowReadConversion } from "../../../dist/policy/conversions/index.js";
import { planCsharpUnionMapping } from "../../../dist/backend/planner/expressions/union-mappings.js";
import { planCsharpRuntimeUnionProjection } from "../../../dist/backend/planner/expressions/runtime-union-projections.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType } from "../../../dist/target-model/types/index.js";

const mappingRejected = { kind: "rejected", reason: "Union conversion requires exact sealed arm coverage and native absence correspondence." };
const projectionRejected = { kind: "rejected", reason: "Union projection requires exact sealed payload and absence correspondence." };
const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => undefined }, target: {} };

function compiled(sourceText, surface) {
  const result = compileCsharpSource({ sourceText, surface });
  assertCsharpCompilationSucceeded(result);
  const { program } = result.result;
  const nodes = [];
  const pending = [...program.sourceFiles];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  return { program, nodes, text: [...result.artifacts.values()].join("\n") };
}

function assertCanonicalMapping(selection, coverage) {
  assert.equal(selection.kind, "union-map");
  assert.equal(selection.coverage, coverage);
  assert.deepEqual(Object.keys(selection).sort(), ["arms", "coverage", "kind"], "one canonical mapping shape");
  assert.equal(Object.isFrozen(selection.arms) || Array.isArray(selection.arms), true);
}

for (const surface of ["native", "js"]) {
  test(`conversion analysis publishes admitted union mappings in ${surface}`, () => {
    const { program, nodes, text } = compiled(`
      export function widen(value: string | number): string | number | boolean { return value; }
    `, surface);
    const returned = nodes.filter(node => program.source.ast.is.IsIdentifier(node) &&
      program.source.ast.text(node) === "value" && program.source.ast.is.IsReturnStatement(program.source.ast.parent(node)));
    assert.equal(returned.length, 1);
    const source = program.records.valueRead.get(returned[0]).value;
    const [target] = program.records.expectedType.get(returned[0]);
    assertCanonicalMapping(program.records.expressionConversion.get(returned[0], source, target, "implicit"), "source");
    assert.match(text, /From\d/, "the admitted mapping is emitted");
  });

  test(`flow-read projections publish admitted union mappings in ${surface}`, () => {
    const { program, nodes, text } = compiled(`
      export function narrow(value: string | number | boolean | undefined): string | number | undefined {
        if (typeof value === "boolean") return undefined;
        return value;
      }
    `, surface);
    const projections = nodes.map(node => program.records.flowReadProjection.get(node))
      .filter(projection => projection?.kind === "conversion" && projection.selection.kind === "union-map");
    assert.equal(projections.length > 0, true, "the narrowed read is a union mapping");
    for (const projection of projections) assertCanonicalMapping(projection.selection, "target");
    assert.match(text, /switch/, "the admitted narrowing mapping is emitted");
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
  assert.equal(admitCsharpUnionSelection(policy, narrow, wide, widening), widening, "a valid mapping is admitted unchanged");
  assert.deepEqual(admitCsharpUnionSelection(policy, wide, narrow, widening), mappingRejected);
  assert.deepEqual(admitCsharpUnionSelection(policy, narrow, wide, { ...widening, arms: widening.arms.slice(1) }), mappingRejected);
  assert.deepEqual(admitCsharpUnionSelection(policy, narrow, wide, { ...widening, coverage: "all" }), mappingRejected);
  const narrowing = selectCsharpFlowReadConversion(policy, csharpNullableTargetType(wide), csharpNullableTargetType(narrow));
  assert.equal(admitCsharpUnionSelection(policy, csharpNullableTargetType(wide), csharpNullableTargetType(narrow), narrowing), narrowing);
  assert.deepEqual(admitCsharpUnionSelection(policy, wide, csharpNullableTargetType(narrow), narrowing), mappingRejected,
    "target coverage cannot invent native absence");
});

test("admission rejects runtime union projections whose payload or absence does not correspond", () => {
  const string = csharpStringTargetType();
  const integer = csharpSourcePrimitiveTargetType("int32");
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const source = csharpNullableTargetType(union);
  const target = csharpNullableTargetType(string);
  const selection = { kind: "runtime-union-projection", path: [{ union, index: 1 }], armType: string, retainsAbsence: true };
  assert.equal(admitCsharpUnionSelection(policy, source, target, selection), selection);
  for (const [selectedSource, selectedTarget, selected] of [
    [union, target, selection], [source, string, selection], [source, target, { ...selection, retainsAbsence: false }],
    [source, target, { ...selection, retainsAbsence: undefined }], [source, target, { ...selection, path: [{ union, index: 0 }] }],
    [source, target, { ...selection, armType: integer }], [source, target, { ...selection, path: [{ union, index: "1" }] }],
    [source, target, { ...selection, path: [] }], [source, target, { ...selection, path: new Array(1) }],
  ]) {
    assert.deepEqual(admitCsharpUnionSelection(policy, selectedSource, selectedTarget, selected), projectionRejected);
  }
});

test("planning consumes admitted mappings without a conversion validation service", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const string = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const narrow = csharpRuntimeUnionTargetType([string, integer]);
  const wide = csharpRuntimeUnionTargetType([integer, boolean, string]);
  const widening = selectCsharpConversion(policy, narrow, wide, "implicit");
  const context = { program: { source: { ast: { pos: () => 0, end: () => 5 } } }, scope: {}, names: { temporaryName: name => name } };
  const diagnostics = [];
  const planned = planCsharpUnionMapping({}, { kind: "IdentifierName", name: "value" }, narrow, wide, widening, context, diagnostics);
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "SwitchExpression");
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const projection = planCsharpRuntimeUnionProjection({}, csharpNullableTargetType(union), csharpNullableTargetType(string),
    { kind: "runtime-union-projection", path: [{ union, index: 1 }], armType: string, retainsAbsence: true },
    { kind: "IdentifierName", name: "value" }, diagnostics, { scope: { typeParameterNames: new Map() }, program: {} });
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(projection.kind, "InvocationExpression");
});
