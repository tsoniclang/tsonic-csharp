import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { sealCsharpAnalysisProgram } from "../../../dist/analysis/program/index.js";
import { resolvedTargetStage, runTargetCompilationStages } from "@tsonic/target-api/artifacts";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

function fixture(changes = {}) {
  const type = Object.freeze({});
  const fieldCall = { kind: "call", typeArguments: [type] };
  const property = { kind: "property", name: { text: "value" }, Initializer: fieldCall };
  const shape = { kind: "object", properties: [property] };
  const declaration = { kind: "variable", Initializer: { kind: "call", arguments: [shape] } };
  const field = Object.freeze({ sourceName: "value", sourceType: type, readonly: true });
  const metadata = Object.freeze({ kind: "csharp-struct", valueType: true, fields: Object.freeze([field]) });
  const carrier = changes.carrier ?? Object.freeze({ kind: "source-primitive", name: "int64" });
  const descriptor = Object.freeze({ kind: "primitive", primitive: "int64" });
  // The published instantiation of the field marker call (facts.instantiations.at); the authored type argument
  // (ast.typeArguments) names the method binder at the same position (nextgen C-2542).
  const publication = Object.freeze({ kind: "call", use: fieldCall, signature: Object.freeze({}),
    method: Object.freeze([{ declaration: Object.freeze({}), type: descriptor }]), receiver: Object.freeze([]),
    parameters: Object.freeze([]), result: descriptor });
  const ast = { is: {
    IsVariableDeclaration: node => node?.kind === "variable", IsCallExpression: node => node?.kind === "call",
    IsObjectLiteralExpression: node => node?.kind === "object", IsPropertyAssignment: node => node?.kind === "property",
    IsComputedPropertyName: () => false,
  }, as: { AsVariableDeclaration: node => node, AsPropertyAssignment: node => node },
  arguments: node => node.arguments, properties: node => node.properties, typeArguments: node => node.typeArguments ?? [],
  name: node => node.name, text: node => node?.text ?? "",
  };
  const evidence = { sourceStruct: { get: node => node === declaration ? metadata : undefined },
    sourceField: { get: subjects => subjects.includes(property) ? field : undefined } };
  const selectedName = Object.freeze({ kind: "resolved", name: "value", constant: Object.freeze({ kind: "string", value: "value" }) });
  // Property names come from facts.analyses.propertyName and the field carrier from facts.instantiations (nextgen C-2542).
  const types = { facts: { analyses: { propertyName: name => name === property.name ? selectedName : undefined },
    instantiations: { at: node => node === fieldCall ? publication : undefined } },
    resolve: (selected, occurrence) => selected === descriptor && occurrence === fieldCall ? carrier : undefined };
  const shapes = { resolveNode: () => undefined };
  return { ast, declaration, property, fieldCall, publication, descriptor, shape, type, field, metadata, carrier, evidence, types, shapes, ...changes };
}

test("value carrier admission publishes complete immutable exact field selections", async () => {
  const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
  const value = fixture();
  const requirements = [];
  const selected = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.types, value.shapes, requirements);
  assert.equal(selected.issues.length, 0, "complete field evidence admitted");
  const declaration = selected.nativeValueDeclaration.get(value.declaration);
  assert.equal(declaration?.source === value.metadata, true, "exact source struct metadata");
  assert.equal(declaration?.fields.length, 1, "one field is not dropped");
  assert.equal(declaration?.fields[0].carrier === value.carrier, true, "native width is selected once");
  assert.equal(declaration?.fields[0].source === value.field, true, "field layout identity retained");
  assert.equal(Object.isFrozen(declaration) && Object.isFrozen(declaration.fields) && Object.isFrozen(declaration.fields[0]),
    true, "immutable selection containers");
  value.types.resolve = () => { assert.fail("a published selection cannot recompute its native field carrier"); };
  value.shapes.resolveNode = () => { assert.fail("a published selection cannot reselect native storage"); };
  assert.equal(selected.nativeValueDeclaration.get(value.declaration) === declaration, true, "reader is a pure identity lookup");
  assert.equal(selected.nativeValueDeclaration.get({}) === undefined, true, "foreign node cannot borrow a selection");
  assert.equal(requirements.length, 1, "one exact required record is registered at its actual producer");
  assert.equal(requirements[0]?.family, "nativeValueDeclaration", "canonical required-record family");
  assert.equal(requirements[0]?.subject === value.declaration, true, "a sibling source cannot satisfy the declaration requirement");
});

test("value carrier admission preserves selected bound storage without guessing a field", async () => {
  const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
  const value = fixture();
  const member = Object.freeze({ bound: true, sourceSubjects: Object.freeze([value.type]), type: value.carrier });
  const shape = Object.freeze({ members: Object.freeze([member]) });
  const selected = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.types,
    { resolveNode: node => node === value.declaration ? shape : undefined }, []);
  const field = selected.nativeValueDeclaration.get(value.declaration)?.fields[0];
  assert.equal(field?.bound?.owner === shape && field.bound.member === member, true, "exact bound owner and native member");
  assert.equal(Object.isFrozen(field.bound), true, "immutable storage correspondence");
});

// nextgen C-2542: the old "foreign call" case (a publication whose call is another node) is removed: the published
// instantiation is keyed by its use (facts.instantiations.at(use)), so no other call's publication is reachable here.
for (const missing of ["call", "explicit argument", "method argument"]) {
  test(`native value fields require their exact published ${missing} boundary`, async () => {
    const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
    const value = fixture();
    const publication = missing === "call" ? undefined : {
      ...value.publication,
      ...(missing === "method argument" ? { method: [] } : {}),
    };
    // The authored explicit type argument no longer names the field's type node.
    if (missing === "explicit argument") value.fieldCall.typeArguments = [{}];
    value.types.facts.instantiations.at = node => {
      assert.equal(node === value.fieldCall, true, "only the actual field marker call owns the type argument");
      return publication;
    };
    value.types.resolve = () => assert.fail("a missing or foreign publication cannot trigger another type resolver");
    const selected = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.types,
      value.shapes, []);
    assert.equal(selected.nativeValueDeclaration.get(value.declaration) === undefined, true,
      "type syntax is not a runtime value and cannot borrow a value read");
    assert.equal(selected.issues.length === 1 && selected.issues[0].node === value.type, true,
      "one exact field rejection precedes sealing");
  });
}

test("the canonical seal requires each native value plan at its exact declaration rather than a present sibling", async () => {
  const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
  const { assertCsharpRequiredRecords } = await import("../../../dist/analysis/program/records/objects/required-records.js");
  const value = fixture();
  const requirements = [];
  const selected = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.types, value.shapes, requirements);
  assert.doesNotThrow(() => assertCsharpRequiredRecords({ nativeValueDeclaration: selected.nativeValueDeclaration }, requirements),
    "the admitted exact declaration satisfies the canonical seal");
  const sibling = {};
  for (const get of [() => undefined, node => node === sibling ? selected.nativeValueDeclaration.get(value.declaration) : undefined]) {
    assert.throws(() => assertCsharpRequiredRecords({ nativeValueDeclaration: { get } }, requirements),
      error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" && error.diagnostic?.sourceNode === value.declaration,
      "a missing exact declaration is an analysis invariant before any planner runs");
  }
});

// nextgen C-2542: CSHARP_UNSUPPORTED_AST is split; each struct admission failure names its .NET reason.
const structFailureCodes = Object.freeze({ "value marker": "CSHARP_STRUCT_DECLARATION_NOT_VALUE_TYPE",
  shape: "CSHARP_STRUCT_SHAPE_NOT_OBJECT_LITERAL", property: "CSHARP_STRUCT_MEMBER_NOT_FIELD",
  "field fact": "CSHARP_STRUCT_MEMBER_NOT_FIELD", carrier: "CSHARP_STRUCT_FIELD_CARRIER_NOT_SELECTED" });
for (const failure of ["value marker", "shape", "property", "field fact", "carrier"]) {
  test(`value carrier admission rejects missing ${failure} before publication`, async () => {
    const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
    const value = fixture();
    if (failure === "value marker") value.evidence.sourceStruct.get = () => ({ ...value.metadata, valueType: false });
    if (failure === "shape") value.declaration.Initializer.arguments = [];
    if (failure === "property") value.property.kind = "spread";
    if (failure === "field fact") value.evidence.sourceField.get = () => undefined;
    if (failure === "carrier") value.types.resolve = () => undefined;
    const requirements = [];
    const selected = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.types, value.shapes, requirements);
    assert.equal(selected.issues.length, 1, "one precise owner rejection");
    assert.equal(selected.issues[0]?.code, structFailureCodes[failure], "the split struct admission code");
    assert.equal(selected.nativeValueDeclaration.get(value.declaration) === undefined, true, "invalid declaration is never published");
    assert.equal(requirements.length === 1 && requirements[0]?.subject === value.declaration, true,
      "failed producer admission cannot silently erase its required source subject");
  });
}

for (const surface of ["native", "js"]) {
  test(`native value structs publish their selected carriers before planning (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { field, struct } from "@tsonic/core/lang.js";
import type { int32, int64 } from "@tsonic/core/types.js";
export const Point = struct({ x: field<int32>(), y: field<int64>() });
export type Point = typeof Point;
export function read(value: Point): int64 { return value.y; }
` });
    assert.equal(compiled.result.diagnostics.length, 0,
      `value struct admitted: ${compiled.result.diagnostics.map(issue => issue.message).join(" | ")}`);
    const ast = compiled.result.program.source.syntax;
    let declaration;
    const visit = node => {
      if (ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "Point") declaration = node;
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(csharpProgramSourceFiles(compiled.result.program)[0]);
    assert.equal(declaration !== undefined, true, "authored struct declaration");
    const selected = compiled.result.program.records.nativeValueDeclaration.get(declaration);
    assert.equal(selected?.fields.length, 2, "every field is admitted before planning");
    assert.equal(selected?.fields[0].carrier.name, "int32", "first exact native width");
    assert.equal(selected?.fields[1].carrier.name, "int64", "second exact native width");
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/struct Point\b/u.test(generated), true, "native value layout is not boxed into a class");
    assert.equal(/public int x;/u.test(generated) && /public long y;/u.test(generated), true,
      "selected native field carriers reach C# without floating-point repairs");
  });

  test(`native value structs consume published anonymous field definitions (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { field, struct } from "@tsonic/core/lang.js";
import type { int32, int64 } from "@tsonic/core/types.js";
export const Packet = struct({ range: field<{ from: int32; to: int64 }>() });
export type Packet = typeof Packet;
export function read(value: Packet): int64 { return value.range.to; }
` });
    assert.equal(compiled.result.diagnostics.length, 0,
      compiled.result.diagnostics.map(issue => issue.message).join(" | "));
    const { program } = compiled.result;
    let declaration;
    const visit = node => {
      if (program.source.syntax.is.IsVariableDeclaration(node) && program.source.syntax.text(program.source.syntax.name(node)) === "Packet") declaration = node;
      program.source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(declaration !== undefined, true, "the exact authored native value declaration");
    const selected = program.records.nativeValueDeclaration.get(declaration);
    assert.equal(selected?.fields.length === 1 && selected.fields[0].carrier.kind === "target-named" &&
      selected.fields[0].carrier.csharpGeneratedStructuralStorage === true, true,
    "the anonymous definition is represented without a fake type-syntax value read");
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/public int from;/u.test(generated) && /public long to;/u.test(generated), true,
      "both published native widths reach the nested native layout");
  });
}

test("native value record field metadata retains its exact published member origin through literal construction", () => {
  for (const surface of ["native", "js"]) {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { field, struct } from "@tsonic/core/lang.js";
import type { int32 } from "@tsonic/core/types.js";
export const Point: { value: int32 } = struct({ value: field<int32>() });
export function make(): typeof Point { return { value: 7 }; }
` });
    assert.equal(compiled.sourceDiagnosticsText, "", `${surface}: the exact record program is source-valid`);
    assert.equal(compiled.result.diagnostics.length, 0,
      compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join("; "));
    assert.equal(compiled.result.program !== undefined, true, `${surface}: the physical record is admitted`);
    const { program } = compiled.result;
    const { source } = program;
    let declaration;
    const visit = node => {
      if (source.syntax.is.IsVariableDeclaration(node) && source.syntax.text(source.syntax.name(node)) === "Point") declaration = node;
      source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(declaration !== undefined, true, `${surface}: the actual native record declaration`);
    const outcome = source.facts.values.type(declaration);
    const structure = outcome?.kind === "refused" || outcome === undefined ? undefined : sourceTypeDescriptorStructure(outcome.type);
    const selected = program.objectShapes.resolveNode(declaration);
    assert.equal(structure?.kind === "shape" && structure.members.length === 1 && selected?.members.length === 1, true,
      `${surface}: neither published nor native field inventory is dropped`);
    const member = selected.members[0];
    assert.equal(member.type.kind === "source-primitive" && member.type.name === "int32", true,
      `${surface}: physical field width stays int32`);
    assert.equal(member.origins?.length === 1 && sourceTypeDescriptorMemberOriginsEqual(member.origins[0],
      structure.members[0].origin), true, `${surface}: native metadata retains the identical opaque Source origin`);
  }
});

function valueProgram() {
  const compiled = compileCsharpSource({ sourceText: `
import { field, struct } from "@tsonic/core/lang.js";
import type { int32, int64 } from "@tsonic/core/types.js";
export const Point = struct({ x: field<int32>(), y: field<int64>() });
export type Point = typeof Point;
` });
  assert.equal(compiled.result.diagnostics.length, 0, "the unmodified native value declaration is valid");
  // The planner reads the sealed program (records and syntax only), as in production (nextgen C-2542).
  const program = sealCsharpAnalysisProgram(compiled.result.program);
  let declaration;
  const visit = node => {
    if (program.source.ast.is.IsVariableDeclaration(node) && program.source.ast.text(program.source.ast.name(node)) === "Point") declaration = node;
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  assert.equal(declaration !== undefined, true, "the exact authored value declaration is retained");
  return { program, declaration, selected: program.records.nativeValueDeclaration.get(declaration) };
}

for (const carrier of [{ kind: "opaque", id: "unrenderable" }, { kind: "target-named", id: "test.NoRenderShape" }]) {
  test(`an unrenderable selected ${carrier.kind} field refuses the whole value declaration and artifact publication`, async () => {
    const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
    const { createCsharpPlanningContext } = await import("../../../dist/backend/planner/context.js");
    const { planValueTypeDeclaration } = await import("../../../dist/backend/planner/declarations/value-types.js");
    const { planCsharpOutput } = await import("../../../dist/backend/planner/program/planning.js");
    const value = fixture({ carrier });
    const admitted = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.types,
      value.shapes, []);
    assert.equal(admitted.nativeValueDeclaration.get(value.declaration) === undefined, true,
      "an unrenderable selected field cannot become a sealed value declaration");
    assert.equal(admitted.issues.length, 1, "one fail-closed native render diagnostic");
    // nextgen C-2542: split code for a selected field carrier without C# syntax.
    assert.equal(admitted.issues[0]?.code, "CSHARP_STRUCT_FIELD_CARRIER_NOT_RENDERABLE", "the source-reachable render path is not mislabeled as an invariant");
    assert.equal(admitted.issues[0]?.node === value.type, true, "the exact field carrier is diagnosed");
    assert.equal(admitted.issues[0]?.message.includes("no renderable selected native carrier"), true, "no second type choice or fallback");
    const { program, declaration, selected } = valueProgram();
    const fields = Object.freeze(selected.fields.map((field, index) => index === 0 ? Object.freeze({ ...field, carrier }) : field));
    const record = Object.freeze({ ...selected, fields });
    const changed = Object.freeze({ ...program, records: Object.freeze({ ...program.records,
      nativeValueDeclaration: Object.freeze({ get: node => node === declaration ? record : program.records.nativeValueDeclaration.get(node) }),
    }) });
    const diagnostics = [];
    let planned;
    let failure;
    try {
      planned = planValueTypeDeclaration(declaration, program.source.ast.getSourceFile(declaration),
        createCsharpPlanningContext(changed), diagnostics);
    } catch (error) {
      failure = error;
    }
    assert.equal(planned === undefined, true, "a partial struct is never returned");
    assert.equal(failure?.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT" &&
      failure.diagnostic.sourceNode === selected.fields[0].source.sourceType, true,
    "a poisoned sealed record violates the already-proven native field admission at its exact source");
    assert.equal(diagnostics.length, 0, "the planner cannot repeat source rejection after admission");
    assert.equal(record.fields.length, 2, "neither selected field is dropped from its admitted input");
    let published = false;
    const result = runTargetCompilationStages({ analyze: () => resolvedTargetStage(changed),
      plan: value => planCsharpOutput(createCsharpPlanningContext(value)),
      materialize: () => { published = true; assert.fail("a failed field render cannot publish native artifacts"); },
    });
    assert.equal(result.kind, "rejected", "the complete output plan fails closed");
    assert.equal(published, false, "no incomplete native type or artifact escapes");
  });
}

test("bound value-field storage is renderable before its native declaration can be published", async () => {
  const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
  const value = fixture();
  const member = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "value" }),
    sourceName: "value", targetName: "value", memberKind: "property", bound: true,
    sourceSubjects: Object.freeze([value.type]), type: Object.freeze({ kind: "opaque", id: "unrenderable-bound-field" }) });
  const shape = Object.freeze({ targetType: { kind: "target-named", id: "test.BoundValue" }, members: Object.freeze([member]) });
  const admitted = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.types,
    { resolveNode: () => shape }, []);
  assert.equal(admitted.nativeValueDeclaration.get(value.declaration) === undefined, true,
    "valid scalar reads do not conceal an unrenderable physical bound-field contract");
  assert.equal(admitted.issues.length === 1 && admitted.issues[0].node === value.type &&
    admitted.issues[0].code === "CSHARP_STRUCT_FIELD_CARRIER_NOT_RENDERABLE" &&
    admitted.issues[0].message === "The bound value-type member has no renderable storage contract.", true,
  "one expected rejection owns the exact physical storage before sealing");
});

test("selected scalar and bound value fields retain their complete native rendering", async () => {
  const { analyzeCsharpObjectMemberEmission } = await import("../../../dist/analysis/objects/member-emission.js");
  const { createCsharpPlanningContext } = await import("../../../dist/backend/planner/context.js");
  const { planValueTypeDeclaration } = await import("../../../dist/backend/planner/declarations/value-types.js");
  const { objectShapeBoundStorageMemberName } = await import("../../../dist/target-model/names/object-members.js");
  const { program, declaration, selected } = valueProgram();
  const member = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "x" }), sourceName: "x", targetName: "x",
    memberKind: "property", type: selected.fields[0].carrier, bound: true });
  const shape = Object.freeze({ targetType: { kind: "target-named", id: "test.Point" }, members: Object.freeze([member]) });
  const record = Object.freeze({ ...selected, fields: Object.freeze([
    Object.freeze({ ...selected.fields[0], bound: Object.freeze({ owner: shape, member }) }), selected.fields[1],
  ]) });
  const members = analyzeCsharpObjectMemberEmission({ shapes: { knownShapes: () => [shape] },
    demand: { artifacts: [], get: () => undefined }, captures: { captureFrameShape: { get: () => undefined } },
    storage: { nativeField: { get: () => undefined } } });
  assert.equal(members.issues.length, 0, "the actual member owner admits the injected native bound storage");
  assert.equal(members.records.objectMember.get(shape, member)?.boundStorage !== undefined, true,
    "the injected physical member has its sealed storage contract before planning");
  const changed = { ...program, records: { ...program.records,
    nativeValueDeclaration: { get: node => node === declaration ? record : program.records.nativeValueDeclaration.get(node) },
    objectMember: { get: (owner, selectedMember) => owner === shape && selectedMember === member
      ? members.records.objectMember.get(owner, selectedMember) : program.records.objectMember.get(owner, selectedMember) },
    // The injected bound cell is a physical member the sealed name analysis never saw; it hides no inherited member.
    nativeMemberHiding: { get: subject => subject.kind === "value" && subject.container === declaration &&
      subject.member === objectShapeBoundStorageMemberName(shape, member) ? false : program.records.nativeMemberHiding.get(subject) },
  } };
  const diagnostics = [];
  const planned = planValueTypeDeclaration(declaration, program.source.ast.getSourceFile(declaration),
    createCsharpPlanningContext(changed), diagnostics);
  assert.equal(diagnostics.length, 0, "native storage rendering remains accepted");
  assert.equal(planned?.members.length, 3, "the bound native cell and property plus scalar field are all retained");
  assert.equal(planned?.members.filter(candidate => candidate.kind === "FieldDeclaration").length, 2, "both physical fields retained");
  assert.equal(planned?.members.some(candidate => candidate.kind === "PropertyDeclaration" && candidate.name === "x"), true,
    "the selected bound member retains its direct value access");
  assert.equal(planned?.members.some(candidate => candidate.kind === "FieldDeclaration" && candidate.name === "y" && candidate.type.name === "long"), true,
    "the independent scalar field keeps its int64 native layout");
});

test("object method source evidence separates own this, method locals and outer captures once", async () => {
  const { analyzeCsharpObjectMethodSources } = await import("../../../dist/analysis/objects/value-carriers.js");
  // The Source facts program the C# session built (nextgen C-2542: createTargetSourceProgram needs the composition's
  // profile). Lexical captures are a Host analysis (facts.analyses.lexicalCaptures); `reads` counts those reads.
  const checked = analyzeCsharpSource({ sourceText: `export function make(seed: number, initial: number) {
      return { value: initial,
        read<T>(input: T): T { const local = seed; const nested = () => this.value + local; nested(); return input; },
        sibling(): number { return seed; }
      };
    }` });
  assert.equal(checked.sourceDiagnosticsText, "", "the object method program is checked source");
  const { source } = checked;
  const ast = source.syntax;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  source.sourceFiles.filter(file => ast.getFileName(file) === "/project/index.ts").forEach(visit);
  const literal = nodes.find(node => ast.is.IsObjectLiteralExpression(node));
  const seed = nodes.find(node => ast.is.IsParameterDeclaration(node) && ast.text(ast.name(node)) === "seed");
  const methods = nodes.filter(node => ast.is.IsMethodDeclaration(node));
  assert.equal(literal !== undefined && seed !== undefined && methods.length === 2, true, "exact checked owner domain");
  let reads = 0;
  const facts = { navigation: source.facts.navigation, analyses: {
    lexicalCaptures(callable) { reads += 1; return source.facts.analyses.lexicalCaptures(callable); },
  } };
  const index = analyzeCsharpObjectMethodSources(ast, nodes, facts, () => undefined);
  const completedReads = reads;
  assert.equal(completedReads > 0, true, "canonical checked lexical evidence is consumed during analysis");
  const selected = index.get(literal);
  for (const method of methods) {
    const captures = selected?.captures(method);
    assert.equal(captures?.length, 1, "own this, input/local and field initializer are not outer binding captures");
    assert.equal(captures?.[0].declaration === seed, true, "only the exact outer seed binding is captured");
    assert.equal(Object.isFrozen(captures) && Object.isFrozen(captures[0]), true, "immutable checked capture rows");
  }
  assert.equal(reads, completedReads, "published getters perform no source reanalysis");
  assert.equal(index.get({}) === undefined && selected.captures({}) === undefined, true, "foreign owners have no capture evidence");
});
