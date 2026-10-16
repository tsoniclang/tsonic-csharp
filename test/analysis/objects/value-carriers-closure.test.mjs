import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { resolvedTargetStage, runTargetCompilationStages } from "@tsonic/target-api/artifacts";

function fixture(changes = {}) {
  const type = Object.freeze({});
  const property = { kind: "property", name: { text: "value" }, Initializer: {} };
  const shape = { kind: "object", properties: [property] };
  const declaration = { kind: "variable", Initializer: { kind: "call", arguments: [shape] } };
  const field = Object.freeze({ sourceName: "value", sourceType: type, readonly: true });
  const metadata = Object.freeze({ kind: "csharp-struct", valueType: true, fields: Object.freeze([field]) });
  const carrier = Object.freeze({ kind: "source-primitive", name: "int64" });
  const ast = { is: {
    IsVariableDeclaration: node => node?.kind === "variable", IsCallExpression: node => node?.kind === "call",
    IsObjectLiteralExpression: node => node?.kind === "object", IsPropertyAssignment: node => node?.kind === "property",
  }, as: { AsVariableDeclaration: node => node, AsPropertyAssignment: node => node },
  arguments: node => node.arguments, properties: node => node.properties,
  name: node => node.name, text: node => node?.text ?? "",
  };
  const evidence = { sourceStruct: { get: node => node === declaration ? metadata : undefined },
    sourceField: { get: subjects => subjects.includes(property) ? field : undefined } };
  const values = { valueRead: { get: node => node === type ? { value: carrier } : undefined } };
  const shapes = { resolveNode: () => undefined };
  return { ast, declaration, property, shape, type, field, metadata, carrier, evidence, values, shapes, ...changes };
}

test("value carrier admission publishes complete immutable exact field selections", async () => {
  const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
  const value = fixture();
  const requirements = [];
  const selected = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.values, value.shapes, requirements);
  assert.equal(selected.issues.length, 0, "complete field evidence admitted");
  const declaration = selected.nativeValueDeclaration.get(value.declaration);
  assert.equal(declaration?.source === value.metadata, true, "exact source struct metadata");
  assert.equal(declaration?.fields.length, 1, "one field is not dropped");
  assert.equal(declaration?.fields[0].carrier === value.carrier, true, "native width is selected once");
  assert.equal(declaration?.fields[0].source === value.field, true, "field layout identity retained");
  assert.equal(Object.isFrozen(declaration) && Object.isFrozen(declaration.fields) && Object.isFrozen(declaration.fields[0]),
    true, "immutable selection containers");
  value.values.valueRead.get = () => { assert.fail("a published selection cannot recompute its native field carrier"); };
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
  const selected = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.values,
    { resolveNode: node => node === value.declaration ? shape : undefined }, []);
  const field = selected.nativeValueDeclaration.get(value.declaration)?.fields[0];
  assert.equal(field?.bound?.owner === shape && field.bound.member === member, true, "exact bound owner and native member");
  assert.equal(Object.isFrozen(field.bound), true, "immutable storage correspondence");
});

test("the canonical seal requires each native value plan at its exact declaration rather than a present sibling", async () => {
  const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
  const { assertCsharpRequiredRecords } = await import("../../../dist/analysis/program/records/required-records.js");
  const value = fixture();
  const requirements = [];
  const selected = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.values, value.shapes, requirements);
  assert.doesNotThrow(() => assertCsharpRequiredRecords({ nativeValueDeclaration: selected.nativeValueDeclaration }, requirements),
    "the admitted exact declaration satisfies the canonical seal");
  const sibling = {};
  for (const get of [() => undefined, node => node === sibling ? selected.nativeValueDeclaration.get(value.declaration) : undefined]) {
    assert.throws(() => assertCsharpRequiredRecords({ nativeValueDeclaration: { get } }, requirements),
      error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" && error.diagnostic?.sourceNode === value.declaration,
      "a missing exact declaration is an analysis invariant before any planner runs");
  }
});

for (const failure of ["value marker", "shape", "property", "field fact", "carrier"]) {
  test(`value carrier admission rejects missing ${failure} before publication`, async () => {
    const { analyzeCsharpNativeValueCarriers } = await import("../../../dist/analysis/objects/value-carriers.js");
    const value = fixture();
    if (failure === "value marker") value.evidence.sourceStruct.get = () => ({ ...value.metadata, valueType: false });
    if (failure === "shape") value.declaration.Initializer.arguments = [];
    if (failure === "property") value.property.kind = "spread";
    if (failure === "field fact") value.evidence.sourceField.get = () => undefined;
    if (failure === "carrier") value.values.valueRead.get = () => undefined;
    const requirements = [];
    const selected = analyzeCsharpNativeValueCarriers(value.ast, [value.declaration], value.evidence, value.values, value.shapes, requirements);
    assert.equal(selected.issues.length, 1, "one precise owner rejection");
    assert.equal(selected.issues[0]?.code, "CSHARP_UNSUPPORTED_AST", "existing source diagnostic family retained");
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
    const source = compiled.result.program.source;
    let declaration;
    const visit = node => {
      if (source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "Point") declaration = node;
      source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(compiled.result.program.sourceFiles[0]);
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
}

function valueProgram() {
  const compiled = compileCsharpSource({ sourceText: `
import { field, struct } from "@tsonic/core/lang.js";
import type { int32, int64 } from "@tsonic/core/types.js";
export const Point = struct({ x: field<int32>(), y: field<int64>() });
export type Point = typeof Point;
` });
  assert.equal(compiled.result.diagnostics.length, 0, "the unmodified native value declaration is valid");
  const { program } = compiled.result;
  let declaration;
  const visit = node => {
    if (program.source.ast.is.IsVariableDeclaration(node) && program.source.ast.text(program.source.ast.name(node)) === "Point") declaration = node;
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.sourceFiles.forEach(visit);
  assert.equal(declaration !== undefined, true, "the exact authored value declaration is retained");
  return { program, declaration, selected: program.records.nativeValueDeclaration.get(declaration) };
}

for (const carrier of [{ kind: "opaque", id: "unrenderable" }, { kind: "target-named", id: "test.NoRenderShape" }]) {
  test(`an unrenderable selected ${carrier.kind} field refuses the whole value declaration and artifact publication`, async () => {
    const { createCsharpPlanningContext } = await import("../../../dist/backend/planner/context.js");
    const { planValueTypeDeclaration } = await import("../../../dist/backend/planner/declarations/value-types.js");
    const { planCsharpOutput } = await import("../../../dist/backend/planner/program/planning.js");
    const { program, declaration, selected } = valueProgram();
    const fields = Object.freeze(selected.fields.map((field, index) => index === 0 ? Object.freeze({ ...field, carrier }) : field));
    const record = Object.freeze({ ...selected, fields });
    const changed = Object.freeze({ ...program, records: Object.freeze({ ...program.records,
      nativeValueDeclaration: Object.freeze({ get: node => node === declaration ? record : program.records.nativeValueDeclaration.get(node) }),
    }) });
    const diagnostics = [];
    const planned = planValueTypeDeclaration(declaration, program.source.ast.getSourceFile(declaration),
      createCsharpPlanningContext(changed), diagnostics);
    assert.equal(planned === undefined, true, "a partial struct is never returned");
    assert.equal(diagnostics.length, 1, "one fail-closed native render diagnostic");
    assert.equal(diagnostics[0]?.code, "CSHARP_UNSUPPORTED_AST", "the source-reachable render path is not mislabeled as an invariant");
    assert.equal(diagnostics[0]?.sourceNode === selected.fields[0].source.sourceType, true, "the exact field carrier is diagnosed");
    assert.equal(diagnostics[0]?.message.includes("no renderable selected native carrier"), true, "no second type choice or fallback");
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

test("selected scalar and bound value fields retain their complete native rendering", async () => {
  const { createCsharpPlanningContext } = await import("../../../dist/backend/planner/context.js");
  const { planValueTypeDeclaration } = await import("../../../dist/backend/planner/declarations/value-types.js");
  const { program, declaration, selected } = valueProgram();
  const member = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "x" }), sourceName: "x", targetName: "x",
    memberKind: "property", type: selected.fields[0].carrier, bound: true });
  const shape = Object.freeze({ targetType: { kind: "target-named", id: "test.Point" }, members: Object.freeze([member]) });
  const record = Object.freeze({ ...selected, fields: Object.freeze([
    Object.freeze({ ...selected.fields[0], bound: Object.freeze({ owner: shape, member }) }), selected.fields[1],
  ]) });
  const changed = { ...program, records: { ...program.records,
    nativeValueDeclaration: { get: node => node === declaration ? record : program.records.nativeValueDeclaration.get(node) },
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
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project",
    compilerOptions: { strict: true, module: "esnext", moduleResolution: "bundler" },
    files: { "/project/index.ts": `export function make(seed: number, initial: number) {
      return { value: initial,
        read<T>(input: T): T { const local = seed; const nested = () => this.value + local; nested(); return input; },
        sibling(): number { return seed; }
      };
    }` },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  source.navigation.sourceFiles.forEach(visit);
  const literal = nodes.find(node => source.ast.is.IsObjectLiteralExpression(node));
  const seed = nodes.find(node => source.ast.is.IsParameterDeclaration(node) && source.ast.text(source.ast.name(node)) === "seed");
  const methods = nodes.filter(node => source.ast.is.IsMethodDeclaration(node));
  assert.equal(literal !== undefined && seed !== undefined && methods.length === 2, true, "exact checked owner domain");
  let reads = 0;
  const navigation = { ...source.navigation,
    sourceReferenceFor(node) { reads += 1; return source.navigation.sourceReferenceFor(node); },
  };
  const index = analyzeCsharpObjectMethodSources(source.ast, nodes, navigation, () => undefined);
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
