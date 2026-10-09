import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpCaptureStorage } from "../../../dist/analysis/callables/capture-storage.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const callable = csharpDelegateTargetType("System.Func", [scalar], scalar);

function fixture(body, quotation = false) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project",
    files: { "/project/index.ts": `
      declare function invoke(mapper: (value: number) => number): number;
      declare function unknown(mapper: (value: number) => number): number;
      export function run(value: number) { ${body} }
    ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics.slice(0, 4)).slice(0, 1024));
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  assert.equal(file !== undefined, true, "checked source file");
  const lambdas = [];
  const calls = [];
  const declarations = new Map();
  const visit = node => {
    if (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) lambdas.push(node);
    if (source.ast.is.IsCallExpression(node)) calls.push(node);
    if (source.ast.is.IsFunctionDeclaration(node)) declarations.set(source.ast.text(source.ast.name(node)), node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const operations = new Map(calls.map(call => {
    const checkedCall = source.semantics.forNode(call).operations.call(call);
    const callee = source.ast.as.AsCallExpression(call)?.Expression;
    const declaration = callee === undefined ? undefined : source.navigation.sourceReferenceFor(callee)?.declaration;
    const parameter = { type: callable, passingMode: "by-value" };
    const selected = declaration === declarations.get("invoke") ? { origin: "source-profile",
      invocationOnlyCallableArgumentIndexes: Object.freeze([0]),
      arguments: [{ sourceArgumentIndex: 0, sourceForm: "value", targetParameter: parameter }],
    } : { origin: "provider", invocationOnlyCallableArgumentIndexes: Object.freeze([0]),
      arguments: [{ sourceArgumentIndex: 0, sourceForm: "value", targetParameter: parameter }],
    };
    return [call, { source: checkedCall, target: { kind: "resolved", call: Object.freeze(selected) } }];
  }));
  const evidence = { isCompileTimeMetadata: () => false, typeParameterConstraints: () => [],
    nodeTargetType: node => source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node) ? callable : scalar,
    storageTargetType: () => undefined };
  const storage = { nativeBacking: () => undefined, nativeArray: () => undefined, type: () => undefined,
    requiresTypedLocationIdentity: () => false };
  const names = { resolve: () => ({ kind: "resolved", name: "selected" }), temporaryName: name => name };
  const target = quotation ? { kind: "target-named", id: "Fixture::Quotation", csharpExpressionTreeDelegateType: callable } : undefined;
  const selected = analyzeCsharpCaptureStorage(source, { knownShapes: () => [] }, storage, evidence,
    [], names, { runtimeDefault: () => undefined }, { call: node => operations.get(node) }, { callableTarget: () => target });
  assert.equal(selected.issues.length, 0, "closed capture storage");
  assert.equal(lambdas.length, 1, "one exact authored callable");
  return { selected, lambda: lambdas[0], operations, source };
}

for (const [name, body] of [
  ["inline argument", "return invoke((entry: number) => entry + 1);"],
  ["parenthesized argument", "return invoke(((entry: number) => entry + 1));"],
  ["satisfies argument", "return invoke(((entry: number) => entry + 1) satisfies ((value: number) => number));"],
  ["inline named recursion", "return invoke(function recurse(entry: number): number { return entry === 0 ? 1 : recurse(entry - 1); });"],
  ["immutable aliases", "const mapper = (entry: number) => entry + 1; const alias = mapper; invoke(alias); return invoke(mapper);"],
]) {
  test(`only sealed invocation arguments cache capture-free ${name}`, () => {
    const input = fixture(body);
    const selected = input.selected.lambdaCreation(input.lambda);
    assert.equal(selected.kind, "cached");
    assert.equal(selected.staticBody, true);
    assert.equal(Object.isFrozen(selected), true);
  });
}

for (const [name, body, staticBody = true] of [
  ["unknown destination", "return unknown((entry: number) => entry + 1);"],
  ["optional argument call", "return invoke?.((entry: number) => entry + 1);"],
  ["spread argument", "return invoke(...[(entry: number) => entry + 1]);"],
  ["mixed destination aliases", "const mapper = (entry: number) => entry + 1; const alias = mapper; invoke(alias); return unknown(mapper);"],
  ["observed identity", "const mapper = (entry: number) => entry + 1; const alias = mapper; invoke(alias); return mapper === alias;"],
  ["returned value", "const mapper = (entry: number) => entry + 1; invoke(mapper); return mapper;"],
  ["stored value", "const mapper = (entry: number) => entry + 1; invoke(mapper); return { mapper };"],
  ["writable alias", "let mapper = (entry: number) => entry + 1; return invoke(mapper);"],
  ["unproved declaration annotation", "const mapper: (entry: number) => number = entry => entry + 1; return invoke(mapper);"],
  ["named self value", "return invoke(function self(entry: number): number { const alias = self; return alias === self ? entry : -1; });", false],
]) {
  test(`${name} preserves fresh native creation despite stateless bodies`, () => {
    const input = fixture(body);
    const selected = input.selected.lambdaCreation(input.lambda);
    assert.equal(selected.kind, "fresh");
    assert.equal(selected.staticBody, staticBody, "observed self values require their exact nonstatic identity binding");
  });
}

test("invocation-only captured callbacks use their native activation without static caches", () => {
  const input = fixture("return invoke((entry: number) => entry + value);");
  assert.equal(input.selected.lambdaCreation(input.lambda).kind, "inline");
  assert.equal(input.selected.lambdaCreation(input.lambda).staticBody, false);
});

test("missing callable creation evidence remains conservative", () => {
  const input = fixture("return invoke((entry: number) => entry + 1);");
  const unknown = input.selected.lambdaCreation({});
  assert.equal(unknown.kind, "fresh");
  assert.equal(unknown.staticBody, false);
  assert.equal(Object.isFrozen(unknown), true);
});

for (const body of ["return invoke((entry: number) => entry + 1);", "return invoke((entry: number) => entry + value);"]) {
  test(`exact quotation evidence preserves syntax independently of delegate flow (${body})`, () => {
    const input = fixture(body, true);
    const selected = input.selected.lambdaCreation(input.lambda);
    assert.equal(selected.kind, "quotation");
    assert.equal(selected.staticBody, false);
    assert.equal(input.selected.closure(input.lambda), undefined);
    assert.equal(Object.isFrozen(selected), true);
  });
}
