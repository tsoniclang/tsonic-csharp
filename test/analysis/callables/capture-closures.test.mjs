import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { selectCsharpFrameClosures } from "../../../dist/analysis/callables/capture-closures.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const callable = Object.freeze({ kind: "target-named", id: "System.Func", typeArguments: [scalar] });

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
  const loops = [];
  const visit = node => {
    if (source.ast.is.IsForStatement(node)) loops.push(node);
    if (source.ast.is.IsVariableDeclaration(node) || source.ast.is.IsBindingElement(node) ||
      source.ast.is.IsParameterDeclaration(node) || source.ast.is.IsFunctionDeclaration(node)) {
      const name = source.ast.name(node);
      if (name !== undefined && source.ast.is.IsIdentifier(name)) declarations.set(source.ast.text(name), node);
      types.set(node, source.ast.is.IsFunctionDeclaration(node) ? callable : scalar);
    }
    if (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) types.set(node, callable);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const evidence = {
    isCompileTimeMetadata: node => metadata.has(node),
    storageTargetType: node => storageTypes.get(node),
    nodeTargetType: node => types.get(node),
  };
  const declaration = name => {
    const selected = declarations.get(name);
    assert.equal(selected !== undefined, true, `exact declaration ${name}`);
    return selected;
  };
  const owner = name => {
    const selected = declaration(name);
    return source.ast.as.AsVariableDeclaration(selected)?.Initializer ?? selected;
  };
  const select = (groups = new Map(), physicalType = (_declaration, type) => type, valueOwned = new Set()) => {
    const issues = [];
    const selected = selectCsharpFrameClosures(source, evidence, groups, physicalType, issues, valueOwned);
    return { ...selected, groups, issues };
  };
  return { source, loops, declaration, owner, types, storageTypes, metadata, select };
}

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
    assert.equal(selected.groups.size, 1);
    assert.equal(selected.groups.get(input.loops[0])?.size, 1);
    assert.equal(selected.groups.get(input.loops[0])?.get(index) === scalar, true, "one exact native binding");
    assert.equal(selected.closures.length, 1);
    assert.equal(selected.closures[0]?.scope === input.loops[0], true, "one exact iteration activation");
    assert.equal(selected.closures[0]?.captures.length, 1);
    assert.equal(selected.closures[0]?.captures[0] === index, true);
    assert.equal(selected.closures[0]?.type === callable, true);
    assert.equal(Object.isFrozen(selected.closures), true);
    assert.equal(Object.isFrozen(selected.closures[0]), true);
    assert.equal(Object.isFrozen(selected.closures[0]?.captures), true);
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
    assert.equal(selected.closures.length, 1);
    assert.equal(selected.closures[0]?.declaration === input.owner("read"), true);
    assert.equal(selected.closures[0]?.scope === input.loops[0], true);
    assert.equal(selected.namedSelfBindings.length, name === "named fixed-self calls" ? 1 : 0);
  });
}

test("nested lexical function declarations retain the exact loop binding frame", () => {
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) { function read() { return index; } return read; }
  }`);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.closures.length, 1);
  assert.equal(selected.closures[0]?.declaration === input.declaration("read"), true);
  assert.equal(selected.closures[0]?.scope === input.loops[0], true);
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
    assert.equal(selected.groups.size, 0);
    assert.equal(selected.closures.length, 0);
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
  assert.equal(selected.groups.get(input.loops[0])?.get(index) === scalar, true);
  assert.equal(selected.closures[0]?.captures[0] === index, true);
});

test("one closure retains all exact slots of its header without collapsing equal carriers", () => {
  const input = fixture(`export function outer() {
    for (let first = 0, second = 1; first < 3; first++) { const read = () => first + second; return read; }
  }`);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.groups.size, 1);
  assert.equal(selected.groups.get(input.loops[0])?.size, 2);
  assert.equal(selected.closures.length, 1);
  assert.equal(selected.closures[0]?.captures.includes(input.declaration("first")), true);
  assert.equal(selected.closures[0]?.captures.includes(input.declaration("second")), true);
});

test("nested loop captures retain their distinct owners and nearest callable activation", () => {
  const input = fixture(`export function outer() {
    for (let first = 0; first < 3; first++) {
      for (let second = 0; second < 3; second++) { const read = () => first + second; return read; }
    }
  }`);
  const selected = input.select();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.groups.size, 2);
  assert.equal(selected.groups.get(input.loops[0])?.has(input.declaration("first")), true);
  assert.equal(selected.groups.get(input.loops[1])?.has(input.declaration("second")), true);
  assert.equal(selected.closures.length, 1);
  assert.equal(selected.closures[0]?.scope === input.loops[1], true);
  assert.equal(selected.closures[0]?.captures.length, 2);
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
  const retainedBindings = new Map([[index, retainedType]]);
  const groups = new Map([[input.loops[0], retainedBindings]]);
  const selected = input.select(groups, (_declaration, type) => type, new Set([input.owner("generic")]));
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.groups.size, 1);
  assert.equal(selected.groups.get(input.loops[0]) === retainedBindings, true);
  assert.equal(retainedBindings.get(index) === retainedType, true);
  assert.equal(selected.closures.length, 1);
  assert.equal(selected.closures[0]?.declaration === input.owner("read"), true);
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
  const first = selected.closures.find(closure => closure.declaration === input.owner("first"));
  const second = selected.closures.find(closure => closure.declaration === input.owner("second"));
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.groups.size, 2);
  assert.equal(selected.closures.length, 2);
  assert.equal(first?.scope === input.loops[0], true);
  assert.equal(second?.scope === input.loops[1], true);
  assert.equal(first?.captures[0] !== second?.captures[0], true, "same spelling is not binding identity");
  assert.equal(selected.groups.get(input.loops[0])?.has(first?.captures[0]), true);
  assert.equal(selected.groups.get(input.loops[1])?.has(second?.captures[0]), true);
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
  assert.equal(selected.groups.size, 1);
  assert.equal(selected.groups.get(scope)?.get(input.declaration("value")) === scalar, true);
  assert.equal(selected.closures.length, 1);
  assert.equal(selected.closures[0]?.scope === scope, true);
});

test("loop captures retain selected physical storage rather than a read-refined carrier", () => {
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) { const read = () => index; return read; }
  }`);
  const index = input.declaration("index");
  const storage = Object.freeze({ kind: "target-named", id: "Native.Location", typeArguments: [scalar] });
  const logical = Object.freeze({ kind: "source-primitive", name: "int32" });
  input.storageTypes.set(index, logical);
  const selected = input.select(new Map(), (declaration, type) => {
    assert.equal(declaration === index, true, "exact physical storage producer");
    assert.equal(type === logical, true, "binding storage evidence outranks read evidence");
    return storage;
  });
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.groups.get(input.loops[0])?.get(index) === storage, true);
});

test("missing loop binding or callable evidence rejects rather than selecting an untyped native closure", () => {
  for (const missing of ["index", "read"]) {
    const input = fixture(`export function outer() {
      for (let index = 0; index < 3; index++) { const read = () => index; return read; }
    }`);
    input.types.delete(missing === "index" ? input.declaration("index") : input.owner("read"));
    const selected = input.select();
    assert.equal(selected.closures.length, 0, missing);
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
  const groups = new Map([[input.loops[0], new Map([[index, incompatible]])]]);
  const selected = input.select(groups);
  assert.equal(selected.closures.length, 0);
  assert.equal(selected.issues.length > 0, true);
  assert.equal(selected.issues.every(issue => issue.code === "CSHARP_CAPTURE_STORAGE_CONFLICT" && issue.node === index), true);
  assert.equal(selected.groups.get(input.loops[0])?.get(index) === incompatible, true);
});

test("uncaptured and erased loop closures allocate no runtime activation frame", () => {
  const uncaptured = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) { const read = () => 0; read(); }
  }`).select();
  assert.equal(uncaptured.issues.length, 0);
  assert.equal(uncaptured.groups.size, 0);
  assert.equal(uncaptured.closures.length, 0);
  const input = fixture(`export function outer() {
    for (let index = 0; index < 3; index++) { const read = () => index; read(); }
  }`);
  input.metadata.add(input.owner("read"));
  const erased = input.select();
  assert.equal(erased.issues.length, 0);
  assert.equal(erased.groups.size, 0);
  assert.equal(erased.closures.length, 0);
});
