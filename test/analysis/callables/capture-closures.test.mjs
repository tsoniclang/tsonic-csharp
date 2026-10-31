import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceCallableDefinitionIsDiscarded } from "@tsonic/target-api/source";
import { analyzeCsharpNativeCaptures } from "../../../dist/analysis/callables/values/capture-closures.js";
import { createCaptureContractFixture } from "../../helpers/capture-contracts.mjs";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";

import { sealCsharpCaptureStorage } from "../../../dist/analysis/program/records/callables/capture-storage.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const callable = csharpDelegateTargetType("System.Func", [], scalar);

function fixture(text) {
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/project",
    files: { "/project/index.ts": text },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics.slice(0, 4)).slice(0, 1024));
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  assert.equal(file !== undefined, true, "exact checked fixture");
  const declarations = new Map();
  const types = new Map();
  const storageTypes = new Map();
  const metadata = new Set();
  const runtimeDefaults = new Set();
  const nativeBackings = new Map();
  const creationDemand = new Map();
  const loops = [];
  const visit = node => {
    if (source.ast.is.IsForStatement(node)) loops.push(node);
    if (source.ast.is.IsVariableDeclaration(node) || source.ast.is.IsBindingElement(node) ||
      source.ast.is.IsParameterDeclaration(node) || source.ast.is.IsFunctionDeclaration(node)) {
      const name = source.ast.name(node);
      if (name !== undefined && source.ast.is.IsIdentifier(name)) declarations.set(source.ast.text(name), node);
      types.set(node, source.ast.is.IsFunctionDeclaration(node) ? callable : scalar);
    }
    if (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) {
      types.set(node, callable);
      creationDemand.set(node, sourceCallableDefinitionIsDiscarded(node, source.ast, source.navigation));
    }
    if (source.ast.kindName(node) === "KindThisKeyword" || source.ast.kindName(node) === "KindSuperKeyword") {
      types.set(node, Object.freeze({ kind: "target-named", id: "Fixture.Receiver", csharpAllowsRefLikeTypeArguments: [] }));
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const evidence = { compileTimeMetadata: { get: node => metadata.has(node) },
    storageTargetType: { get: node => storageTypes.get(node) },
    nodeTargetType: { get: node => types.get(node) } };
  const declaration = name => {
    const selected = declarations.get(name);
    assert.equal(selected !== undefined, true, `exact declaration ${name}`);
    return selected;
  };
  const owner = name => {
    const selected = declaration(name);
    return source.ast.as.AsVariableDeclaration(selected)?.Initializer ?? selected;
  };
  const select = (physicalType = (_declaration, type) => type) => {
    const issues = [];
    const selected = analyzeCsharpNativeCaptures(source, evidence, physicalType, issues,
      Object.freeze({ get: node => creationDemand.get(node) }), createCaptureContractFixture(source, node => types.get(node)),
      { get: () => false }, { selectedCall: { get: () => undefined }, selectedConstruction: { get: () => undefined } });
    assert.equal(Object.hasOwn(selected, "groups"), false, "no ordinary physical grouping publication");
    assert.equal(Object.hasOwn(selected, "closures"), false, "no ordinary synthetic frame-method publication");
    return { ...selected, issues,
      captures: selected.lexicalCaptures.filter(capture => capture.values.length > 0 || capture.receivers.length > 0),
      places: new Map(selected.lexicalCaptures.flatMap(capture => capture.values.map(place => [place.declaration, place]))),
      captureFreeDeclarations: Object.freeze(selected.lexicalCaptures.filter(capture =>
        capture.values.length === 0 && capture.receivers.length === 0).map(capture => capture.owner)),
    };
  };
  return { source, loops, declaration, owner, types, storageTypes, metadata, runtimeDefaults, nativeBackings, select };
}

test("capture-free declaration identities reuse exact lexical binding and receiver evidence", () => {
  const input = fixture(`let globalValue = 1;
    export function outer(value: number) {
      const stateless = () => globalValue;
      const captured = () => value;
      const named = function self(count: number): number { return count === 0 ? 1 : self(count - 1); };
      return stateless() + captured() + named(1);
    }
    export class Receiver { value = 1; read() { const receiver = () => this.value; return receiver(); } }
    export class Derived extends Receiver { read() { const superRead = () => super.read(); return superRead(); } }`);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.captureFreeDeclarations.includes(input.owner("stateless")), true, "module storage is not a lexical activation");
  assert.equal(selected.captureFreeDeclarations.includes(input.owner("named")), true, "exact self recursion is not an outer capture");
  assert.equal(selected.captureFreeDeclarations.includes(input.owner("captured")), false, "lexical parameter capture");
  assert.equal(selected.captureFreeDeclarations.includes(input.owner("receiver")), false, "lexical this receiver capture");
  assert.equal(selected.captureFreeDeclarations.includes(input.owner("superRead")), false, "lexical super receiver capture");
  assert.equal(Object.isFrozen(selected.lexicalCaptures), true);
});

test("prepared constructor default and body closures share the exact parameter activation", () => {
  const input = fixture(`class Base { constructor(callback: () => number) { callback(); } }
    export class Derived extends Base {
      read: () => number;
      constructor(value: number, adjust: () => number = () => ++value) {
        super(adjust);
        this.read = () => value;
      }
    }`);
  input.runtimeDefaults.add(input.declaration("adjust"));
  const selected = input.select();
  const constructor = input.source.ast.parent(input.declaration("value"));
  const body = input.source.ast.body(constructor);
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.captures.length, 2);
  assert.equal(selected.captures.every(capture => capture.values[0]?.scope === body), true);
  assert.equal(selected.captures.every(capture => capture.values[0]?.declaration === input.declaration("value")), true);
  assert.equal(selected.places.size, 1, "default and body retain the SAME original parameter place");
});

test("a default-only constructor capture retains its callable-body activation", () => {
  const input = fixture(`class Base { constructor(callback: () => number) { callback(); } }
    export class Derived extends Base {
      constructor(value: number, adjust: () => number = () => ++value) { super(adjust); }
    }`);
  input.runtimeDefaults.add(input.declaration("adjust"));
  const selected = input.select();
  const constructor = input.source.ast.parent(input.declaration("value"));
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.captures.length, 1);
  assert.equal(selected.captures[0]?.values[0]?.scope === input.source.ast.body(constructor), true);
});

test("constructor capture rejects a missing exact physical carrier", () => {
  const input = fixture(`class Base { constructor(callback: () => number) { callback(); } }
    export class Derived extends Base {
      constructor(value: number, adjust: () => number = () => ++value) { super(adjust); }
    }`);
  input.runtimeDefaults.add(input.declaration("adjust"));
  input.types.delete(input.declaration("value"));
  const selected = input.select();
  assert.equal(selected.issues.some(issue => issue.code === "CSHARP_CONSTRUCTOR_CAPTURE_NOT_CLOSED"), true);
  assert.equal(selected.places.size, 0);
});

test("constructor preparation reuses an existing native backing without allocating another environment", () => {
  const input = fixture(`class Base { constructor(callback: () => number) { callback(); } }
    export class Derived extends Base {
      constructor(value: number, adjust: () => number = () => ++value) { super(adjust); }
    }`);
  input.runtimeDefaults.add(input.declaration("adjust"));
  const backing = Object.freeze({ kind: "target-named", id: "Native.Location", typeArguments: [scalar],
    csharpAllowsRefLikeTypeArguments: [false] });
  input.nativeBackings.set(input.declaration("value"), backing);
  const selected = input.select((declaration, type) => input.nativeBackings.get(declaration) ?? type);
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.places.get(input.declaration("value"))?.declaration === input.declaration("value"), true);
  assert.equal(selected.places.get(input.declaration("value"))?.type === backing, true, "the same selected native backing, without another environment");
  assert.equal(selected.captures.length, 1, "native backing remains the same captured place, without an ordinary frame");
});

test("destructured prepared constructor arguments retain captured binding-element identity", () => {
  const input = fixture(`class Base { constructor(callback: () => number) { callback(); } }
    export class Derived extends Base {
      constructor({ value }: { value: number }) { super(() => ++value); }
    }`);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.captures.length, 1);
  assert.equal(selected.captures[0]?.values[0]?.declaration === input.declaration("value"), true);
  assert.equal(selected.places.size, 1);
});

test("uncaptured prepared constructors and unsplit constructor captures require no explicit frame", () => {
  for (const text of [
    `class Base { constructor(value: number) {} }
      export class Derived extends Base { constructor(value: number = 7) { super(value); } }`,
    `export class Derived {
      read: () => number;
      constructor(value: number) { this.read = () => value; }
    }`,
  ]) {
    const input = fixture(text);
    input.runtimeDefaults.add(input.declaration("value"));
    const selected = input.select();
    assert.equal(selected.issues.length, 0);
    assert.equal(selected.places.size, text.includes("this.read") ? 1 : 0);
    assert.equal(selected.captures.length, text.includes("this.read") ? 1 : 0);
  }
});

for (const [name, text] of [
  ["body reads", `export function outer() {
    for (let index = 0; index < 3; index++) { const read = () => index; return read; }
    return () => 0;
  }`],
  ["body writes", `export function outer() {
    for (let index = 0; index < 3; index++) { const read = () => index; index += 1; return read; }
    return () => 0;
  }`],
  ["finally writes", `export function outer() {
    for (let index = 0; index < 3; index++) {
      const read = () => index; try { return read; } finally { index += 1; }
    }
    return () => 0;
  }`],
  ["initializer creation", `export function outer() {
    for (let index = 0, read = () => index; index < 3; index++) { return read; }
    return () => 0;
  }`],
  ["condition creation", `export function outer() {
    for (let index = 0; (() => index)() < 3; index++) { index += 1; }
  }`],
  ["incrementor creation", `export function outer() {
    let saved = () => -1;
    for (let index = 0; index < 3; (saved = () => index, index++)) {}
    return saved;
  }`],
]) {
  test(`ordinary loop ${name} select the exact existing iteration-frame activation`, () => {
    const input = fixture(text);
    const selected = input.select();
    const index = input.declaration("index");
    assert.equal(selected.issues.length, 0);
    assert.equal(selected.places.size, 1);
    assert.equal(selected.places.get(index)?.type === scalar, true, "one exact native binding");
    assert.equal(selected.places.get(index)?.scope === input.loops[0], true, "original checked iteration owner");
    assert.equal(selected.captures.length, 1);
    assert.equal(selected.captures[0]?.values.length, 1);
    assert.equal(selected.captures[0]?.values[0]?.declaration === index, true);
    assert.equal(selected.captures[0]?.values[0]?.references.length > 0, true);
    assert.equal(selected.captures[0]?.type === callable, true);
    assert.equal(Object.isFrozen(selected.lexicalCaptures), true);
    assert.equal(Object.isFrozen(selected.captures[0]), true);
    assert.equal(Object.isFrozen(selected.captures[0]?.values), true);
  });
}

for (const [name, initializer] of [
  ["anonymous function expression", "function () { return index; }"],
  ["named fixed-self calls", "function original(depth: number): number { return depth === 0 ? index : original(depth - 1); }"],
]) {
  test(`loop ${name} use the same native frame owner as arrows`, () => {
    const input = fixture(`export function outer() {
      for (let index = 0; index < 3; index++) { const read = ${initializer}; return read; }
    }`);
    const selected = input.select();
    assert.equal(selected.issues.length, 0);
    assert.equal(selected.captures.length, 1);
    assert.equal(selected.captures[0]?.owner === input.owner("read"), true);
    assert.equal(selected.captures[0]?.values[0]?.scope === input.loops[0], true);
    assert.equal(selected.namedSelfBindings.length, name === "named fixed-self calls" ? 1 : 0);
  });
}

test("nested lexical function declarations retain the exact loop binding frame", () => {
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) { function read() { return index; } return read; }
  }`);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.captures.length, 1);
  assert.equal(selected.captures[0]?.owner === input.declaration("read"), true);
  assert.equal(selected.captures[0]?.values[0]?.scope === input.loops[0], true);
});

test("first-class named self retains exact existing loop captures without becoming a cached frame method", () => {
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) {
      const read = function original(depth: number): number {
        const same = original;
        const identity = (): boolean => same === original;
        if (!identity()) return -1;
        return depth === 0 ? index : original(depth - 1);
      };
      return read;
    }
  }`);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.places.get(input.declaration("index"))?.scope === input.loops[0], true);
  assert.equal(selected.places.get(input.declaration("index"))?.type === scalar, true);
  assert.equal(selected.captures.some(capture => capture.owner === input.owner("read")), true,
    "self identity remains at the original creation, not a frame method");
  assert.equal(selected.namedSelfBindings.length, 1);
  const self = selected.namedSelfBindings[0];
  assert.equal(self.declaration === input.owner("read"), true);
  assert.equal(self.calls.length, 1);
  assert.equal(self.values.length, 2, "own identity and nested identity select the same immutable self");
  assert.equal(self.captures.length, 1);
  assert.equal(self.captures[0] === input.declaration("index"), true);
  assert.equal(Object.isFrozen(self.captures), true);
});

for (const [name, text] of [
  ["function-scoped var", `export function outer() {
    for (var index = 0; index < 3; index++) { const read = () => index; return read; }
  }`],
  ["const header", `export function outer() {
    for (const index = 0; index < 3;) { const read = () => index; return read; }
  }`],
  ["enclosing let", `export function outer() {
    let index = 0; for (; index < 3; index++) { const read = () => index; return read; }
  }`],
  ["body-local let", `export function outer() {
    for (let index = 0; index < 3; index++) { let value = index; const read = () => value; return read; }
  }`],
  ["parameter", `export function outer(value: number) {
    for (let index = 0; index < 3; index++) { const read = () => value; return read; }
  }`],
  ["native foreach activation", `export function outer() {
    for (let index of [0, 1, 2]) { const read = () => index; return read; }
  }`],
]) {
  test(`${name} does not acquire a counted-loop rotation owner`, () => {
    const selected = fixture(text).select();
    assert.equal(selected.issues.length, 0);
    assert.equal(selected.captures.length, 1);
    assert.equal(selected.captures[0].values.length, 1);
    assert.equal(selected.captures[0].values[0].references.length > 0, true);
  });
}

test("destructured header bindings retain their exact declaration and activation", () => {
  const input = fixture(`export function outer() {
    for (let { index } = { index: 0 }; index < 3; index++) { const read = () => index; return read; }
  }`);
  const selected = input.select();
  const index = input.declaration("index");
  assert.equal(input.source.ast.is.IsBindingElement(index), true);
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.places.get(index)?.type === scalar, true);
  assert.equal(selected.places.get(index)?.scope === input.loops[0], true);
  assert.equal(selected.captures[0]?.values[0]?.declaration === index, true);
});

test("one closure retains all exact slots of its header without collapsing equal carriers", () => {
  const input = fixture(`export function outer() {
    for (let first = 0, second = 1; first < 3; first++) { const read = () => first + second; return read; }
  }`);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.places.size, 2);
  assert.equal(selected.captures.length, 1);
  assert.equal(selected.captures[0]?.values.some(place => place.declaration === input.declaration("first")), true);
  assert.equal(selected.captures[0]?.values.some(place => place.declaration === input.declaration("second")), true);
});

test("nested loop captures retain their distinct owners and nearest callable activation", () => {
  const input = fixture(`export function outer() {
    for (let first = 0; first < 3; first++) {
      for (let second = 0; second < 3; second++) { const read = () => first + second; return read; }
    }
  }`);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.places.size, 2);
  assert.equal(selected.places.get(input.declaration("first"))?.scope === input.loops[0], true);
  assert.equal(selected.places.get(input.declaration("second"))?.scope === input.loops[1], true);
  assert.equal(selected.captures.length, 1);
  assert.equal(selected.captures[0]?.values.length, 2);
});

test("ordinary closures reuse an existing generic-selected frame without replacing its physical carrier", () => {
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) {
      const generic = <Value>(value: Value): number => index;
      const read = () => index; return read;
    }
  }`);
  const index = input.declaration("index");
  const retainedType = Object.freeze({ ...scalar });
  input.storageTypes.set(index, retainedType);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.places.size, 1);
  assert.equal(selected.places.get(index)?.type === retainedType, true);
  assert.equal(selected.captures.length, 2);
  assert.equal(selected.captures.every(capture => capture.values[0]?.declaration === index), true);
  assert.equal(selected.captures.every(capture => capture.values[0]?.type === retainedType), true);
});

test("same-spelled nested headers remain distinct exact storage and callable owners", () => {
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) {
      const first = () => index;
      for (let index = 0; index < 3; index++) { const second = () => index; return second; }
      return first;
    }
  }`);
  const selected = input.select();
  const first = selected.captures.find(capture => capture.owner === input.owner("first"));
  const second = selected.captures.find(capture => capture.owner === input.owner("second"));
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.places.size, 2);
  assert.equal(selected.captures.length, 2);
  assert.equal(first?.values[0]?.scope === input.loops[0], true);
  assert.equal(second?.values[0]?.scope === input.loops[1], true);
  assert.equal(first?.values[0]?.declaration !== second?.values[0]?.declaration, true, "same spelling is not binding identity");
  assert.equal(selected.places.has(first?.values[0]?.declaration), true);
  assert.equal(selected.places.has(second?.values[0]?.declaration), true);
});

test("existing non-loop deferred initialization retains its native activation owner", () => {
  const input = fixture(`export function outer() {
    const read = () => value;
    let value = 1;
    return read;
  }`);
  const selected = input.select();
  const scope = input.source.ast.body(input.declaration("outer"));
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.places.size, 1);
  assert.equal(selected.places.get(input.declaration("value"))?.type === scalar, true);
  assert.equal(selected.places.get(input.declaration("value"))?.initialization, "deferred");
  assert.equal(selected.captures.length, 1);
  assert.equal(selected.captures[0]?.values[0]?.scope === scope, true);
});

test("loop captures retain selected physical storage rather than a read-refined carrier", () => {
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) { const read = () => index; return read; }
  }`);
  const index = input.declaration("index");
  const storage = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Native.Location", typeArguments: [scalar] });
  const logical = Object.freeze({ kind: "source-primitive", name: "int32" });
  input.storageTypes.set(index, logical);
  const selected = input.select((declaration, type) => {
    assert.equal(declaration === index, true, "exact physical storage producer");
    assert.equal(type === logical, true, "binding storage evidence outranks read evidence");
    return storage;
  });
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.places.get(index)?.type === storage, true);
});

test("missing loop binding or callable evidence rejects rather than selecting an untyped native closure", () => {
  for (const missing of ["index", "read"]) {
    const input = fixture(`export function outer() {
      for (let index = 0; index < 3; index++) { const read = () => index; return read; }
    }`);
    input.types.delete(missing === "index" ? input.declaration("index") : input.owner("read"));
    const selected = input.select();
    assert.equal(selected.captures.length, 0, missing);
    assert.equal(selected.issues.length, 1, missing);
    assert.equal(selected.issues[0]?.code, missing === "index" ? "CSHARP_ITERATION_CAPTURE_NOT_CLOSED" : "CSHARP_CAPTURE_CALLABLE_NOT_CLOSED");
  }
});

test("incompatible existing storage rejects without replacing the frame owner's binding", () => {
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) { const read = () => index; return read; }
  }`);
  const index = input.declaration("index");
  const incompatible = Object.freeze({ kind: "source-primitive", name: "int64" });
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  const original = selected.places.get(index);
  assert.equal(original !== undefined && original.declaration === index, true);
  assert.throws(() => sealCsharpCaptureStorage({ lexicalCaptures: [
    { owner: input.owner("read"), type: callable, values: [original], receivers: [] },
    { owner: input.owner("read"), type: callable, values: [{ ...original, type: incompatible }], receivers: [] },
  ] }), /one completed physical storage decision/u);
  assert.equal(original.type === scalar, true, "failed publication never mutates the original native fact");
});

test("uncaptured and erased loop closures allocate no runtime activation frame", () => {
  const uncaptured = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) { const read = () => 0; read(); }
  }`).select();
  assert.equal(uncaptured.issues.length, 0);
  assert.equal(uncaptured.places.size, 0);
  assert.equal(uncaptured.captures.length, 0);
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) { const read = () => index; read(); }
  }`);
  input.metadata.add(input.owner("read"));
  const erased = input.select();
  assert.equal(erased.issues.length, 0);
  assert.equal(erased.places.size, 0);
  assert.equal(erased.captures.length, 0);
});
