import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource } from "../../helpers/required-records.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { transformCsharpTargetAst } from "../../../dist/backend/target-ast/normalization/transformation.js";
import { csharpStructuralObjectShapeIdentity, csharpSourcePrimitiveTargetType, isCsharpJsValueTargetType, isCsharpRecordDictionaryTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/objects/object-shape-keys.js";
import { printCsharpType } from "../../../dist/print/source/printer.js";
import { createCsharpObjectShapeValueStorage } from "../../../dist/policy/types/objects/shape-carriers.js";
import { applyCsharpObjectShapeDisplayNames } from "../../../dist/backend/target-ast/normalization/object-shape-names.js";
import { selectCsharpObjectShapeDisplayNames } from "../../../dist/analysis/names/object-shapes.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { header, payload, boxing, nativeCostProgram, originalPrograms, originalNativeProgram } from "./native-demand-boxing.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [name, body] of Array.from(originalPrograms).slice(3, 6)) {
test(`${surface}: original ${name} has real native observations and idiomatic allocation controls`, { timeout: 300_000 }, () => {
    const selected = compileCsharpRequiredRecordSource(header + body, surface);
    const output = executeCsharpConstruction(selected.compiled, `original-shape-${surface}-${name}`, false, false, [], originalNativeProgram(name, selected));
    assert.match(output, /^native-cost generated=\d+ native=\d+ sums=28672\/28672\s*$/u,
      "the unmodified original program runs; handwritten baselines do not allocate dead rest/capture objects merely to match compiler output");
  });
}
}

test("native value storage preserves the selected generic vector and its declaration template", () => {
  const parameter = Object.freeze({ kind: "type-parameter", identity: "native.storage.item", name: "Item",
    csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([]) }) });
  const selected = Object.freeze({ kind: "source-primitive", name: "int32" });
  const member = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "item" }), sourceName: "item",
    targetName: "item", memberKind: "property", type: parameter });
  const open = Object.freeze(createStructuralObjectShapeTarget(Object.freeze([member]), undefined,
    () => Object.freeze({ kind: "resolved", constraints: Object.freeze([]) })));
  const permissions = open.csharpAllowsRefLikeTypeArguments;
  const template = Object.freeze({ targetType: open, members: Object.freeze([member]) });
  const vector = Object.freeze([selected]);
  const closed = Object.freeze({ targetType: Object.freeze({ ...open, typeArguments: vector }),
    members: Object.freeze([Object.freeze({ ...member, type: selected })]), declarationTemplate: template });
  const physical = createCsharpObjectShapeValueStorage(closed);
  assert.equal(physical !== undefined && physical.targetType.csharpValueType === true, true, "the selected layout is a native value type");
  assert.equal(physical.targetType.typeArguments === vector, true, "the actual ordered native generic ABI is unchanged");
  assert.equal(physical.targetType.csharpAllowsRefLikeTypeArguments === permissions, true, "native slot permissions are not guessed or copied");
  assert.equal(physical.members === closed.members, true, "field carriers remain the original selected evidence");
  assert.equal(physical.declarationTemplate.targetType.id === physical.targetType.id, true, "open and closed native layout have one declaration identity");
  assert.equal(physical.declarationTemplate.targetType.typeArguments === open.typeArguments, true, "authored binder identities are retained");
  assert.equal(physical.targetType.id !== open.id && open.csharpValueType === undefined, true, "per-use physical storage cannot mutate the source-wide reference layout");
  assert.equal(Object.isFrozen(physical) && Object.isFrozen(physical.targetType), true, "the physical selection is immutable");
  for (const [name, shape] of [
    ["unproved generated storage", { ...closed, targetType: { ...closed.targetType, csharpGeneratedStructuralStorage: undefined } }],
    ["nominal", { ...closed, targetType: { ...closed.targetType, csharpSourceDeclarationKind: "class" } }],
    ["reference guarantee", { ...closed, targetType: { ...closed.targetType, csharpConstraintRequiresReferenceType: true } }],
    ["interface", { ...closed, targetType: { ...closed.targetType, csharpStructuralContract: true } }],
    ["implemented identity", { ...closed, implements: [open] }],
    ["method", { ...closed, members: [{ ...member, memberKind: "method" }] }],
    ["accessor", { ...closed, members: [{ ...member, accessor: { getter: true, setter: false } }] }],
    ["bound", { ...closed, members: [{ ...member, bound: true }] }],
    ["optional", { ...closed, members: [{ ...member, optional: true }] }],
  ]) assert.equal(createCsharpObjectShapeValueStorage(shape) === undefined, true, `${name}: no unproved change of native storage`);
});

test("a selected native value layout uses the same declared identity and reference display name", () => {
  const identity = "aaaaaaaaaaaa1111111111111111111111111111111111111111111111111111";
  const canonicalName = `__TsonicShape_${identity}`;
  const displayName = selectCsharpObjectShapeDisplayNames([{ identity, canonicalName, preferredStem: "Value" }]).get(canonicalName);
  const [unit] = applyCsharpObjectShapeDisplayNames([{
    kind: "CompilationUnit", usings: [], members: [{ kind: "NamespaceDeclaration", name: "Generated", members: [{
      kind: "StructDeclaration", name: canonicalName, objectShapeIdentity: identity, modifiers: ["public"],
      members: [],
    }, {
      kind: "ClassDeclaration", name: "Holder", modifiers: ["public"],
      members: [{ kind: "FieldDeclaration", name: "next", modifiers: ["public"],
        type: { kind: "IdentifierName", name: canonicalName, objectShapeIdentity: identity } }],
    }] }],
  }], [{ identity, canonicalName, displayName }]);
  const declaration = unit.members[0].members[0];
  assert.equal(declaration.kind, "StructDeclaration", "display naming never changes the analysis-selected native kind");
  assert.equal(declaration.name, "ValueShape_aaaaaaaaaaaa", "the selected declaration is renamed at the existing canonical owner");
  assert.equal(unit.members[0].members[1].members[0].type.name, declaration.name,
    "references and their actual native value declaration retain identical names");
});

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [name, body] of Array.from([
    ["local captured receiver", "function maker(seed: int32): () => int32 { const value = { count: seed }; return () => value.count; } export function run(): boolean { return maker(7)() === 7; }"],
    ["local read receiver", "export function run(): boolean { const value = { count: 7 as int32 }; return value.count === 7; }"],
    ["fresh destructured rest", "function read({ first, ...value }: { first: int32; count: int32 }): int32 { return first + value.count; } export function run(): boolean { return read({ first: 3 as int32, count: 4 as int32 }) === 7; }"],
  ]).slice(0, 3)) {
test(`${surface}: ${name} selects physical value storage before publication and preserves native observations`, { timeout: 300_000 }, () => {
    const selected = compileCsharpRequiredRecordSource(header + body, surface);
    const declaration = selected.nodes.find(node => (selected.source.ast.is.IsVariableDeclaration(node) &&
      selected.source.ast.text(selected.source.ast.as.AsVariableDeclaration(node).name) === "value") ||
      (selected.source.ast.is.IsBindingElement(node) && selected.source.ast.text(selected.source.ast.as.AsBindingElement(node).name) === "value"));
    assert.equal(declaration !== undefined, true, `${name}: one actual checked storage declaration`);
    const carrier = selected.program.records.storageType.get(declaration);
    assert.equal(carrier?.csharpValueType === true, true, `${name}: the original storage owner publishes the native value carrier`);
    const shape = selected.program.objectShapes.resolveTarget(carrier);
    assert.equal(shape?.members.some(member => member.sourceName === "count") === true, true, `${name}: no field was omitted`);
    assert.equal([...selected.compiled.artifacts.values()].some(source => /public struct\s/u.test(source)), true,
      `${name}: codegen renders the selected value layout without inventing a representation`);
    executeCsharpConstruction(selected.compiled, `physical-storage-${surface}-${name.replaceAll(" ", "-")}`);
  });
}

for (const [name, body] of Array.from([
    ["shared alias mutation", "export function run(): boolean { const value = { count: 7 as int32 }; const alias = value; alias.count += 1; return alias === value && value.count === 8; }"],
    ["captured member mutation", "function maker(): () => int32 { const value = { count: 7 as int32 }; const mutate = () => { value.count += 1; }; mutate(); return () => value.count; } export function run(): boolean { return maker()() === 8; }"],
    ["reference comparison", "export function run(): boolean { const value = { count: 7 as int32 }; return value === value && value.count === 7; }"],
    ["returned aggregate", "function make() { const value = { count: 7 as int32 }; return value; } export function run(): boolean { const actual = make(); return actual.count === 7; }"],
    ["aggregate argument", "function read(input: { count: int32 }): int32 { return input.count; } export function run(): boolean { const value = { count: 7 as int32 }; return read(value) === 7; }"],
  ]).slice(0, 3)) {
test(`${surface}: ${name} retains reference storage and native identity`, { timeout: 300_000 }, () => {
    const selected = compileCsharpRequiredRecordSource(header + body, surface);
    const declaration = selected.nodes.find(node => selected.source.ast.is.IsVariableDeclaration(node) &&
      selected.source.ast.text(selected.source.ast.as.AsVariableDeclaration(node).name) === "value");
    assert.equal(declaration !== undefined, true, `${name}: actual original declaration`);
    const carrier = selected.program.records.storageType.get(declaration);
    assert.equal(carrier !== undefined && carrier.csharpValueType !== true, true, `${name}: the original identity-bearing carrier is retained`);
    executeCsharpConstruction(selected.compiled, `physical-storage-inverse-${surface}-${name.replaceAll(" ", "-")}`);
  });
}
}
