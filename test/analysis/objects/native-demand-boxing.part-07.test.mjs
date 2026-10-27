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

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [name, body] of Array.from([
    ["shared alias mutation", "export function run(): boolean { const value = { count: 7 as int32 }; const alias = value; alias.count += 1; return alias === value && value.count === 8; }"],
    ["captured member mutation", "function maker(): () => int32 { const value = { count: 7 as int32 }; const mutate = () => { value.count += 1; }; mutate(); return () => value.count; } export function run(): boolean { return maker()() === 8; }"],
    ["reference comparison", "export function run(): boolean { const value = { count: 7 as int32 }; return value === value && value.count === 7; }"],
    ["returned aggregate", "function make() { const value = { count: 7 as int32 }; return value; } export function run(): boolean { const actual = make(); return actual.count === 7; }"],
    ["aggregate argument", "function read(input: { count: int32 }): int32 { return input.count; } export function run(): boolean { const value = { count: 7 as int32 }; return read(value) === 7; }"],
  ]).slice(3, 5)) {
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

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
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
  ]).slice(0, 5)) {
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
