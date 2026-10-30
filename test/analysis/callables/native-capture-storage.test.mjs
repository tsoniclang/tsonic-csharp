import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceLexicalCaptures } from "@tsonic/target-api/source";
import { analyzeCsharpCaptureStorage } from "../../../dist/analysis/callables/storage/capture-storage.js";
import { csharpConstructorCapturedPlaces } from "../../../dist/analysis/callables/emission/constructor-entry.js";
import { sealCsharpCaptureStorage } from "../../../dist/analysis/program/records/callables/capture-storage.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const callable = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [true],
  id: "System.Func", typeArguments: [scalar] });

function fixture(text) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project",
    files: { "/project/index.ts": text },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics.slice(0, 4)).slice(0, 1024));
  const actual = createTargetSourceProgram(checked);
  const source = { ...actual, navigation: { ...actual.navigation,
    expressionValueFlow() { throw new Error("Ordinary native capture does not consult all-destination value flow."); },
  } };
  const declarations = new Map();
  const types = new Map();
  const metadata = new Set();
  const classCaptures = [];
  const storageTypes = new Map();
  const contexts = new Map();
  const visit = node => {
    if (source.ast.is.IsVariableDeclaration(node) || source.ast.is.IsBindingElement(node) ||
        source.ast.is.IsParameterDeclaration(node) || source.ast.is.IsFunctionDeclaration(node) ||
        source.ast.is.IsClassDeclaration(node)) {
      const name = source.ast.name(node);
      if (name !== undefined && source.ast.is.IsIdentifier(name)) {
        const spelling = source.ast.text(name);
        const values = declarations.get(spelling) ?? [];
        values.push(node);
        declarations.set(spelling, values);
      }
      types.set(node, source.ast.is.IsFunctionDeclaration(node) ? callable : scalar);
    }
    if (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) types.set(node, callable);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  const binding = (name, index = 0) => {
    const selected = declarations.get(name)?.[index];
    assert.equal(selected !== undefined, true, `original checked declaration ${name}/${index}`);
    return selected;
  };
  const owner = name => {
    const selected = binding(name);
    return source.ast.as.AsVariableDeclaration(selected)?.Initializer ??
      source.ast.as.AsParameterDeclaration(selected)?.Initializer ?? selected;
  };
  const evaluate = () => analyzeCsharpCaptureStorage(source, { knownShapes: () => [] }, {
    nativeBacking: { get: () => undefined }, nativeArray: { get: () => undefined },
    storageType: { get: declaration => storageTypes.get(declaration) },
  }, { compileTimeMetadata: { get: node => metadata.has(node) },
    storageTargetType: { get: () => undefined }, nodeTargetType: { get: node => types.get(node) },
    typeParameterConstraints: { get: () => undefined },
    contextualType: { get: node => contexts.get(node) },
  }, classCaptures);
  return { source, binding, owner, evaluate, types, metadata, classCaptures, storageTypes, contexts };
}

test("ordinary native closures retain distinct checked owners over the same original mutable place", () => {
  const input = fixture(`export function create(value: number) {
    const read = () => value;
    const change = () => ++value;
    return { read, change };
  }`);
  const result = input.evaluate();
  assert.equal(result.issues.length, 0);
  assert.equal(result.frames.length, 0);
  assert.equal(result.lexicalCaptures.length, 3, "the declaration and both runtime lambda owners are explicit");
  const declaration = input.binding("value");
  for (const name of ["read", "change"]) {
    const owner = input.owner(name);
    const selected = result.lexicalCaptures.find(capture => capture.owner === owner);
    assert.equal(selected !== undefined && selected.values.length === 1, true, name);
    assert.equal(selected.values[0].declaration === declaration, true, name);
    assert.equal(selected.values[0].type === scalar, true, name);
    assert.equal(selected.values[0].mutable, true, name);
    assert.equal(selected.values[0].references.length > 0, true, name);
    assert.equal(result.captureClosure.get(owner) === undefined, true, name);
    assert.equal(selected.type === callable, true, name);
  }
  const place = result.capturedPlace.get(declaration);
  assert.equal(place !== undefined && place.declaration === declaration, true);
  assert.equal(place.references.length, 2);
  assert.equal(Object.isFrozen(place.references), true);
  assert.equal(result.capturedBinding.get(declaration) === undefined, true);
});

for (const [label, source] of [
  ["loop", `export function create() {
    for (let value: number = 0; value < 3; value++) { const read = () => value; return read; }
    return () => 0;
  }`],
  ["deferred", `export function create() {
    const read = () => value; let value: number = 3; return read;
  }`],
  ["self initializer", `export function create() {
    const value: () => number = () => value(); return value;
  }`],
]) {
  test(`ordinary ${label} capture retains its original place without a custom method or rotation owner`, () => {
    const input = fixture(source);
    if (label === "self initializer") input.types.set(input.binding("value"), callable);
    const result = input.evaluate();
    assert.equal(result.issues.length, 0);
    assert.equal(result.frames.length, 0);
    const place = result.capturedPlace.get(input.binding("value"));
    assert.equal(place !== undefined && place.declaration === input.binding("value"), true, label);
    assert.equal(result.captureFrame.get(place.scope) === undefined, true, label);
    assert.equal(result.capturedBinding.get(place.declaration) === undefined, true, label);
    for (const capture of result.lexicalCaptures) assert.equal(result.captureClosure.get(capture.owner) === undefined, true, label);
  });
}

for (const destructured of [false, true]) {
  test(`constructor default/base/body capture preserves the same original ${destructured ? "binding element" : "parameter"} place`, () => {
    const parameter = destructured ? "{value}: {value: number}" : "value: number";
    const input = fixture(`class Base { constructor(callback: () => number) { callback(); } }
      export class Derived extends Base {
        read: () => number;
        constructor(${parameter}, adjust: () => number = () => ++value) {
          super(adjust); this.read = () => value;
        }
      }`);
    const result = input.evaluate();
    assert.equal(result.issues.length, 0);
    assert.equal(result.frames.length, 1, "only the required class construction entry protocol");
    const declaration = input.binding("value");
    let parameterDeclaration = declaration;
    while (input.source.ast.is.IsBindingElement(parameterDeclaration)) {
      parameterDeclaration = input.source.ast.parent(input.source.ast.parent(parameterDeclaration));
    }
    const constructor = input.source.ast.parent(parameterDeclaration);
    const selected = csharpConstructorCapturedPlaces(input.source.ast, constructor, result);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].declaration === declaration, true);
    assert.equal(selected[0].scope === input.source.ast.body(constructor), true);
    const protocol = result.constructorCapture.get(constructor);
    assert.equal(protocol !== undefined && protocol.declaration === constructor, true);
    assert.equal(protocol.owner === input.source.ast.parent(constructor), true);
    assert.equal(protocol.scope === selected[0].scope, true);
    assert.equal(protocol.places[0].declaration === declaration, true);
    assert.equal(protocol.frame === result.frames[0], true);
    assert.equal(protocol.frame.protocols.some(selected => selected.kind === "class" && selected.declaration === protocol.owner), true);
    assert.equal(result.capturedBinding.get(declaration)?.frame === protocol.frame, true);
    assert.equal(result.lexicalCaptures.filter(capture => capture.values.some(value => value.declaration === declaration)).length, 2);
  });
}

test("a genuinely mutable local-class protocol and an ordinary lambda share the same selected original place", () => {
  const input = fixture(`export function create(value: number) {
    class Holder { read(): number { return ++value; } }
    const read = () => value;
    return { Holder, read };
  }`);
  const declaration = input.binding("value");
  const owner = input.binding("Holder");
  const selected = sourceLexicalCaptures(owner, [owner], input.source.ast, input.source.navigation, "source");
  assert.equal(selected.captures.length, 1);
  input.classCaptures.push({ declaration, reference: selected.captures[0].references[0],
    type: scalar, mutable: true, fieldName: "originalValue" });
  const result = input.evaluate();
  assert.equal(result.issues.length, 0);
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].protocols.length, 1);
  assert.equal(result.frames[0].protocols[0].kind, "class");
  assert.equal(result.frames[0].protocols[0].declaration === owner, true);
  assert.equal(result.frames[0].methods.length, 0);
  assert.equal(result.capturedBinding.get(declaration)?.frame === result.frames[0], true);
  assert.equal(result.capturedPlace.get(declaration)?.type === scalar, true);
  assert.equal(result.captureClosure.get(input.owner("read")) === undefined, true);
});

test("missing ordinary native capture evidence remains an explicit failure at the original binding", () => {
  const input = fixture("export function create(value: number) { return () => value; }");
  const declaration = input.binding("value");
  input.types.delete(declaration);
  const result = input.evaluate();
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].node === declaration, true);
  assert.equal(result.issues[0].code, "CSHARP_CAPTURE_CALLABLE_NOT_CLOSED");
  assert.equal(result.capturedPlace.get(declaration) === undefined, true);
  assert.equal(result.lexicalCaptures.length, 1, "only the independent capture-free declaration remains");
  assert.equal(result.lexicalCaptures[0].owner === input.binding("create"), true);
  assert.equal(result.lexicalCaptures[0].values.length, 0);
  assert.equal(result.lexicalCaptures.some(capture => capture.values.some(place => place.declaration === declaration)), false);
  assert.equal(result.frames.length, 0);
});

test("publication rejects conflicting physical evidence for the same original captured place", () => {
  const declaration = {};
  const scope = {};
  const place = Object.freeze({ declaration, scope, type: scalar, references: Object.freeze([]),
    mutable: true, initialization: "initialized" });
  const incompatible = Object.freeze({ ...place, type: Object.freeze({ kind: "source-primitive", name: "int64" }) });
  assert.throws(() => sealCsharpCaptureStorage({ lexicalCaptures: [
    { owner: {}, type: callable, values: [place], receivers: [] },
    { owner: {}, type: callable, values: [incompatible], receivers: [] },
  ] }), /one completed physical storage decision/u);
});

test("a checked quantified protocol retains its native method and shares its original place with an ordinary closure", () => {
  const input = fixture(`export function create(state: number) {
    const generic = <Value>(value: Value): Value => { state++; return value; };
    const read = () => state;
    return { generic, read };
  }`);
  const owner = input.owner("generic");
  const parameter = Object.freeze({ kind: "type-parameter", name: "Value", identity: "Fixture.Value" });
  const signature = csharpDelegateTargetType("System.Func", [parameter], parameter);
  const protocol = Object.freeze({ kind: "target-named", id: "tsonic.shape:quantified-fixture",
    csharpAllowsRefLikeTypeArguments: [], csharpRender: { kind: "named", name: "QuantifiedFixture" } });
  const type = csharpMethodValueType(protocol, "invoke", "fixture-quantified", signature, [parameter.identity]);
  assert.equal(type !== undefined, true, "the exact native quantified invocation contract is completed");
  input.contexts.set(owner, { targetType: type });
  const result = input.evaluate();
  assert.equal(result.issues.length, 0);
  assert.equal(result.frames.length, 2, "only the required shared place and quantified value environments");
  assert.equal(result.frames.every(frame => frame.protocols.every(selected =>
    selected.kind === "quantified" && selected.declaration === owner)), true);
  const closure = result.captureClosure.get(owner);
  assert.equal(closure !== undefined && closure.method.type === type, true);
  assert.equal(closure.frame.ownership, "value");
  assert.equal(closure.method.declaration === owner, true);
  const shared = result.capturedBinding.get(input.binding("state"));
  assert.equal(shared !== undefined && closure.frame.parents.some(parent => parent.frame === shared.frame), true);
  assert.equal(result.capturedPlace.get(input.binding("state"))?.declaration === input.binding("state"), true);
  assert.equal(result.captureClosure.get(input.owner("read")) === undefined, true);
});

test("a missing quantified native protocol is refused at the original value rather than lowered as an ordinary lambda", () => {
  const input = fixture(`export function create() {
    return <Value>(value: Value): Value => value;
  }`);
  const result = input.evaluate();
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, "CSHARP_GENERIC_CALLABLE_CONTRACT_NOT_CLOSED");
  assert.equal(input.source.ast.is.IsArrowFunction(result.issues[0].node), true);
  assert.equal(result.frames.length, 0);
  assert.equal(result.captureClosure.get(result.issues[0].node) === undefined, true);
});
