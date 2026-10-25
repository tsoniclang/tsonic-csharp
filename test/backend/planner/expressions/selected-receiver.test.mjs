import assert from "node:assert/strict";
import test from "node:test";
import { translateCsharpSelectedReceiver } from "../../../../dist/backend/planner/expressions/receivers.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpNullableReferenceTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { analyzeCsharpMemberReceivers } from "../../../../dist/analysis/objects/member-receivers.js";
import { csharpTypeEmissionRecord } from "../../../helpers/planning-records.mjs";

// The type-or-value decision for a selected receiver is made by analyzeCsharpMemberReceivers from the project
// reference, project type and class-factory records; the planner renders the published decision. receive() runs that
// analysis for the receiver a test selects and plans it.
function receive(evidence, input, diagnostics, planExpression, projection) {
  const access = {};
  const analysis = analyzeCsharpMemberReceivers({ source: { ast: input.program.source.ast }, nodes: [access],
    operations: { selectedProperty: { get: node => node === access ? { selection: { kind: "resolved", source: { receiver: evidence } } } : undefined },
      selectedElement: { get: () => undefined }, selectedCall: { get: () => undefined }, selectedConstruction: { get: () => undefined } },
    references: {}, projects: input.program.records, factories: input.program.records, admitted: () => false });
  const records = { ...input.program.records, memberReceiver: analysis.records.memberReceiver };
  return translateCsharpSelectedReceiver(evidence, {}, { ...input, program: { ...input.program, records } }, diagnostics, planExpression, projection);
}

const instanceInput = { program: { source: { ast: { name: () => undefined } }, records: {
  projectSourceReference: { get: () => undefined }, projectSourceType: { get: () => undefined },
  classFactory: { get: () => undefined }, valueRead: { get: () => undefined }, typeEmission: csharpTypeEmissionRecord(),
} } };

function projectReceiver(kind, scopeName = "ModuleScope") {
  const expression = {};
  const declaration = {};
  const name = {};
  const file = { IsDeclarationFile: false };
  const carrier = csharpStringTargetType();
  const references = { expression: true };
  const records = {
    projectSourceReference: { get: node => node === expression && references.expression || node === name ? declaration : undefined },
    projectSourceType: { get: node => node === declaration ? { name, scopeName } : undefined },
    sourceName: { get: node => node === name ? { kind: "resolved", name: "Entry" } : { kind: "rejected", reason: "unexpected name" } },
    classFactory: { get: () => undefined },
    valueRead: { get: node => node === expression && references.carrier !== false ? { value: carrier } : undefined },
    typeEmission: csharpTypeEmissionRecord(),
  };
  const input = { program: { source: { ast: { kindName: () => kind, name: () => name, getSourceFile: () => file,
    getFileName: () => "/project/entry.ts", is: { IsClassExpression: () => false } } }, records } };
  return { expression, declaration, file, carrier, input, references };
}

test("project class and enum receivers consume the exact module qualification without acquiring constructor delegates", () => {
  for (const kind of ["KindClassDeclaration", "KindEnumDeclaration"]) {
    const { expression, input } = projectReceiver(kind);
    input.program.records.valueRead = { get: () => assert.fail("native type qualification has no runtime carrier lookup") };
    const diagnostics = [];
    const result = receive({ expression, type: {} }, input, diagnostics,
      () => assert.fail("native type references are not runtime constructor acquisition"));
    assert.equal(result === undefined, false, kind);
    assert.equal(result.kind, "type", "the sealed type acquisition remains native type syntax");
    assert.deepEqual(result.expression,
      { kind: "QualifiedName", left: { kind: "IdentifierName", name: "ModuleScope" }, name: "Entry" });
    assert.equal(Object.hasOwn(result, "value"), false, "no fabricated constructor or delegate value");
    assert.equal(Object.hasOwn(result, "prelude"), false, "no allocation or receiver evaluation");
    assert.equal(diagnostics.length, 0, kind);
  }
});

test("constructed instance receivers never become static references merely because their type has a class declaration", () => {
  const { expression, carrier, input, references } = projectReceiver("KindClassDeclaration");
  references.expression = false;
  const planned = csharpPlannedValue(carrier, { kind: "InvocationExpression",
    callee: { kind: "IdentifierName", name: "construct" }, arguments: [] });
  let evaluations = 0;
  const diagnostics = [];
  const result = receive({ expression, type: {} }, input, diagnostics, selected => {
    assert.equal(selected === expression, true);
    evaluations += 1;
    return planned;
  });
  assert.equal(result.kind, "value");
  assert.equal(result.value === planned, true, "the constructed receiver and its effects remain intact");
  assert.equal(evaluations, 1);
  assert.equal(diagnostics.length, 0);
});

test("checked receiver value identity supports transparent syntax without reconstructing the checker", () => {
  const { expression, declaration, input, references } = projectReceiver("KindClassDeclaration");
  references.expression = false;
  const diagnostics = [];
  const result = receive({ expression, type: {}, valueDeclaration: declaration }, input, diagnostics,
    () => assert.fail("parenthesized type syntax is not runtime factory acquisition"));
  assert.equal(result === undefined, false);
  assert.equal(result.kind, "type");
  assert.equal(result.expression.kind, "QualifiedName");
  assert.equal(diagnostics.length, 0);
  const rejected = receive({ expression, type: {}, valueDeclaration: {} }, input, diagnostics,
    () => csharpPlannedValue(csharpStringTargetType(), { kind: "IdentifierName", name: "actualValue" }));
  assert.equal(rejected.kind, "value");
  assert.equal(rejected.value.completion.expression.kind, "IdentifierName", "mismatched exact declarations cannot select static syntax");
});

test("project type receivers never bypass missing or contradictory native type evidence", () => {
  for (const label of ["missing acquisition", "missing checked module", "missing native declaration"]) {
    const { expression, input } = projectReceiver("KindClassDeclaration");
    input.program.records.memberReceiver = { get: () => label === "missing acquisition" ? undefined : { kind: "type", reference: expression } };
    if (label === "missing checked module") input.program.source.ast.getSourceFile = () => undefined;
    if (label === "missing native declaration") input.program.records.projectSourceType = { get: () => undefined };
    const diagnostics = [];
    assert.throws(() => translateCsharpSelectedReceiver({ expression, type: {} }, {}, input, diagnostics,
      () => assert.fail("no speculative constructor acquisition")),
    error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT", label);
    assert.equal(diagnostics.length, 0, label);
  }
});

test("native type qualification never conceals a rejected receiver projection", () => {
  const { expression, input } = projectReceiver("KindClassDeclaration");
  const diagnostics = [];
  assert.throws(() => receive({ expression, type: {} }, input, diagnostics,
    () => assert.fail("rejected evidence cannot acquire a constructor"),
    { source: csharpNullableReferenceTargetType(csharpStringTargetType()), target: csharpStringTargetType(),
      conversion: { kind: "rejected", reason: "missing selected proof" } }),
  error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT");
  assert.equal(diagnostics.length, 0);
});

test("local class factories remain exact runtime receiver values rather than namespace references", () => {
  const { expression, carrier, input } = projectReceiver("KindClassDeclaration");
  input.program.records.classFactory = { get: () => ({}) };
  const planned = csharpPlannedValue(carrier, { kind: "IdentifierName", name: "selectedFactory" });
  let evaluations = 0;
  const diagnostics = [];
  const result = receive({ expression, type: {} }, input, diagnostics, selected => {
    assert.equal(selected === expression, true);
    evaluations += 1;
    return planned;
  });
  assert.equal(result.kind, "value");
  assert.equal(result.value === planned, true, "the owning factory contract remains authoritative");
  assert.equal(evaluations, 1);
  assert.equal(diagnostics.length, 0);
});

test("selected receiver projections consume an already-selected planned value exactly once", () => {
  const selected = csharpStringTargetType();
  const storage = csharpNullableReferenceTargetType(selected);
  const node = {};
  const value = { kind: "PostfixUnaryExpression", operatorToken: { kind: "ExclamationToken" },
    operand: { kind: "IdentifierName", name: "selected" } };
  const prelude = [{ kind: "ExpressionStatement", expression: { kind: "InvocationExpression",
    callee: { kind: "IdentifierName", name: "effect" }, arguments: [] } }];
  const planned = csharpPlannedValue(selected, value, prelude);
  const diagnostics = [];
  const result = receive({ expression: node, type: {} }, instanceInput, diagnostics,
    () => planned, { source: storage, target: selected, conversion: { kind: "nullable-reference" } });
  assert.equal(result.kind, "value");
  assert.equal(result.value === planned, true, "no second null suppression or duplicated effects");
  assert.equal(result.value.prelude.length, 1);
  assert.equal(diagnostics.length, 0);
});

test("selected receiver projections reject an unrelated planned carrier rather than applying a stale conversion", () => {
  const selected = csharpStringTargetType();
  const diagnostics = [];
  assert.throws(() => receive({ expression: {}, type: {} }, instanceInput, diagnostics,
    () => csharpPlannedValue(csharpSourcePrimitiveTargetType("int32"), { kind: "LiteralExpression", value: 1 }),
    { source: csharpNullableReferenceTargetType(selected), target: selected, conversion: { kind: "nullable-reference" } }),
  /exact native value completion/u);
  assert.equal(diagnostics.length, 0);
});

test("selected receiver projections never hide rejected evidence behind an already-selected carrier", () => {
  const selected = csharpStringTargetType();
  const diagnostics = [];
  assert.throws(() => receive({ expression: {}, type: {} }, instanceInput, diagnostics,
    () => csharpPlannedValue(selected, { kind: "IdentifierName", name: "value" }),
    { source: csharpNullableReferenceTargetType(selected), target: selected,
      conversion: { kind: "rejected", reason: "missing selected proof" } }),
  /exact native value completion/u);
  assert.equal(diagnostics.length, 0);
});
