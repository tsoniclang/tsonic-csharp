import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpCallableContracts } from "../../../dist/analysis/callables/analyze.js";
import { selectCsharpClosedCallableContext } from "../../../dist/analysis/callables/contextual-inputs.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { csharpSourceTypeParameter } from "../../../dist/target-model/names/type-parameters.js";
import { csharpJsArrayTargetType } from "../../../dist/policy/types/resolution/surface-types.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const boolean = Object.freeze({ kind: "source-primitive", name: "boolean" });
const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const selectedType = csharpDelegateTargetType("System.Func", [scalar, scalar], scalar);
const firstBinder = Object.freeze({ kind: "type-parameter", identity: "outer:first", name: "T" });
const otherBinder = Object.freeze({ kind: "type-parameter", identity: "outer:other", name: "T" });

function fixture(body, overrides = {}) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project", files: {
    "/project/index.ts": `
      ${overrides.generic ? `
        declare function invoke<T>(mapper: (value: T, index: number) => T): T;
        declare function other<T>(mapper: (value: T, index: number) => T): T;
        export function run<T>() { ${body} }
      ` : `
        declare function invoke(mapper: (value: number, index: number) => number): number;
        declare function other(mapper: (value: number, index: number) => number): number;
        export function run() { ${body} }
      `}
    `,
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics.slice(0, 4)).slice(0, 1024));
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  const lambdas = [];
  const calls = [];
  const visit = node => {
    if (source.ast.is.IsArrowFunction(node)) lambdas.push(node);
    if (source.ast.is.IsCallExpression(node)) calls.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(lambdas.length, 1, "one exact callable declaration");
  const lambda = lambdas[0];
  let scopedBinder;
  let scopedType;
  if (overrides.scopedTrailing === true) {
    const owner = source.ast.statements(file).find(node => source.ast.is.IsFunctionDeclaration(node) &&
      source.ast.body(node) !== undefined && source.ast.typeParameters(node).length > 0);
    scopedBinder = csharpSourceTypeParameter(source.ast.typeParameters(owner)[0], source.ast);
    assert.equal(scopedBinder !== undefined, true, "exact source-owned enclosing binder");
    const trailing = overrides.foreignTrailing ? { ...scopedBinder, identity: "foreign:same-name" } : scopedBinder;
    scopedType = csharpDelegateTargetType("System.Func", [scopedBinder, scalar, csharpJsArrayTargetType(trailing)], scopedBinder);
  }
  const operations = { call(node) {
    const target = source.ast.text(source.ast.as.AsCallExpression(node).Expression);
    const type = target === "other" ? overrides.otherType ?? scopedType ?? selectedType : overrides.type ?? scopedType ?? selectedType;
    return { target: { kind: "resolved", call: {
      origin: overrides.origin ?? "source-profile",
      ...(overrides.effect === false ? {} : { invocationOnlyCallableArgumentIndexes: Object.freeze([0]) }),
      arguments: Object.freeze([{ sourceArgumentIndex: 0, sourceForm: "value", targetParameter: {
        type, passingMode: "by-value",
      } }]),
    } } };
  } };
  const policy = { ast: source.ast, sourceFiles: [file],
    semantics: sourceFile => source.semantics.forFile(sourceFile),
    semanticsFor: node => source.semantics.forNode(node),
    projectTypes: { catalog: { definitions: [] } },
  };
  const evidence = { isCompileTimeMetadata: () => false, generatorTargetType: () => undefined,
    contextualTargetType: () => undefined, nodeTargetType: () => overrides.sourceParameter ?? scopedBinder ?? scalar };
  const declarations = { runtimeDefault: () => undefined,
    returnContract: node => ({ kind: "resolved", type: node === lambda ? overrides.sourceReturn ?? scopedBinder ?? scalar : scalar }),
  };
  const names = { resolve: node => ({ kind: "resolved", name: source.ast.text(node) }) };
  const context = selectCsharpClosedCallableContext(source, policy, operations, lambda);
  const analyzed = analyzeCsharpCallableContracts(policy, evidence, declarations, names, { get: () => [] }, source, operations);
  return { context, scopedType, type: analyzed.closedInputType(lambda), contract: analyzed.get({ kind: "declaration", declaration: lambda }),
    aliasTypes: source.navigation.expressionValueFlow(lambda).aliasDeclarations.map(alias => analyzed.closedInputType(alias)),
  };
}

test("a single exact selected invocation ABI survives strict immutable aliases without changing the authored contract", () => {
  const selected = fixture("const mapper = (value: number): number => value + 1; const alias = mapper; invoke(alias); return invoke(mapper);");
  assert.equal(selected.context?.invocationType === selectedType, true, "one physical native ABI");
  assert.equal(selected.context.inputTypes.every(type => type === undefined), true, "authored inputs retained");
  assert.equal(Object.isFrozen(selected.context), true);
  assert.equal(Object.isFrozen(selected.context.inputTypes), true);
  assert.equal(selected.type === selectedType, true, "the origin carries the selected ABI before alias storage");
  assert.equal(selected.aliasTypes.length, 2, "exact origin and const alias declarations");
  assert.equal(selected.aliasTypes.every(type => type === selectedType), true, "one sealed physical ABI for all proven storage");
  assert.equal(selected.contract.parameters.length, 1, "no extra authored source parameter");
});

for (const [name, body, overrides] of [
  ["unknown provider", "const mapper = (value: number): number => value; return invoke(mapper);", { origin: "provider" }],
  ["missing invocation proof", "const mapper = (value: number): number => value; return invoke(mapper);", { effect: false }],
  ["different selected trailing ABI", "const mapper = (value: number): number => value; invoke(mapper); return other(mapper);",
    { otherType: csharpDelegateTargetType("System.Func", [scalar, boolean], scalar) }],
  ["mutable origin", "let mapper = (value: number): number => value; return invoke(mapper);", {}],
  ["observed identity", "const mapper = (value: number): number => value; const alias = mapper; invoke(alias); return mapper === alias;", {}],
  ["escaping identity", "const mapper = (value: number): number => value; invoke(mapper); return mapper;", {}],
  ["explicit alias contract", "const mapper = (value: number): number => value; const alias: (value: number) => number = mapper; return invoke(alias);", {}],
  ["nullable destination", "const mapper = (value: number): number => value; return invoke(mapper);", { type: csharpNullableTargetType(selectedType) }],
  ["optional native destination", "const mapper = (value: number): number => value; return invoke(mapper);",
    { type: csharpDelegateTargetType("System.Func", [scalar, scalar], scalar, { optionalParameterIndexes: [1] }) }],
  ["rest native destination", "const mapper = (value: number): number => value; return invoke(mapper);",
    { type: csharpDelegateTargetType("System.Func", [scalar, scalar], scalar, { restParameterIndex: 1 }) }],
  ["native borrowed destination", "const mapper = (value: number): number => value; return invoke(mapper);",
    { type: { ...selectedType, csharpDelegateSignature: { ...selectedType.csharpDelegateSignature,
      parameterPassingModes: ["byref-readonly", "by-value"] } } }],
  ["native borrowed return", "const mapper = (value: number): number => value; return invoke(mapper);",
    { type: { ...selectedType, csharpDelegateSignature: { ...selectedType.csharpDelegateSignature,
      returnPassing: "byref-readonly" } } }],
]) {
  test(`${name} does not close a different physical invocation ABI`, () => {
    const selected = fixture(body, overrides);
    assert.equal(selected.context === undefined, true, name);
    assert.equal(selected.type === undefined, true, name);
    assert.equal(selected.aliasTypes.every(type => type === undefined), true, "unproved aliases have no promoted storage ABI");
  });
}

for (const [name, overrides] of [
  ["parameter width", { sourceParameter: integer }],
  ["return width", { sourceReturn: integer }],
  ["native absence", { sourceReturn: csharpNullableTargetType(scalar) }],
]) {
  test(`selected invocation ABI cannot erase exact ${name}`, () => {
    const selected = fixture("const mapper = (value: number): number => value; return invoke(mapper);", overrides);
    assert.equal(selected.context !== undefined, true, "closed source flow alone is insufficient");
    assert.equal(selected.type === undefined, true, name);
    assert.equal(selected.aliasTypes.every(type => type === undefined), true, "native carriers are not erased by alias storage");
  });
}

for (const [name, body] of [
  ["source optional parameter", "const mapper = (value?: number): number => value ?? 0; return invoke(mapper);"],
  ["source rest parameter", "const mapper = (value: number, ...indexes: number[]): number => value; return invoke(mapper);"],
]) {
  test(`selected invocation ABI does not replace a ${name} contract`, () => {
    const selected = fixture(body);
    assert.equal(selected.context !== undefined, true, "closed source flow alone is insufficient");
    assert.equal(selected.type === undefined, true, name);
  });
}

test("existing broad-input closure is preserved independently of invocation-only allocation policy", () => {
  const selected = fixture("const mapper = (value: unknown): number => 1; return invoke(mapper);", { origin: "provider" });
  assert.equal(selected.context?.inputTypes[0] === scalar, true, "exact existing inferred input");
  assert.equal(selected.context.invocationType === undefined, true, "no invented provider effect");
  assert.equal(selected.type?.csharpDelegateSignature.parameters.length, 1, "existing intrinsic closed ABI");
  assert.equal(selected.contract.parameters[0].targetParameter.type === scalar, true);
  assert.equal(selected.aliasTypes.every(type => type === undefined), true, "old broad inference does not force alias storage");
});

test("exact enclosing generic binder identities close one native ABI without changing source parameters", () => {
  const type = csharpDelegateTargetType("System.Func", [firstBinder, scalar], firstBinder);
  const selected = fixture("const mapper = (value: T): T => value; const alias = mapper; return invoke(alias);",
    { generic: true, type, sourceParameter: firstBinder, sourceReturn: firstBinder });
  assert.equal(selected.type === type, true, "exact inherited binder identity");
  assert.equal(selected.aliasTypes.every(aliasType => aliasType === type), true, "one exact generic storage ABI");
  assert.equal(selected.contract.parameters.length, 1, "authored parameter ABI retained");
});

for (const [name, parameters, result] of [
  ["different same-named input binder", [otherBinder, scalar], firstBinder],
  ["different same-named return binder", [firstBinder, scalar], otherBinder],
  ["unbound unused destination binder", [firstBinder, otherBinder], firstBinder],
]) {
  test(`closed generic invocation ABI rejects ${name}`, () => {
    const selected = fixture("const mapper = (value: T): T => value; return invoke(mapper);", {
      generic: true, type: csharpDelegateTargetType("System.Func", parameters, result),
      sourceParameter: firstBinder, sourceReturn: firstBinder,
    });
    assert.equal(selected.type === undefined, true, name);
    assert.equal(selected.aliasTypes.every(type => type === undefined), true, name);
  });
}

test("broad inference still cannot invent an enclosing generic binder", () => {
  const selected = fixture("const mapper = (value: unknown): T => { throw value; }; return invoke<T>(mapper);", {
    generic: true, type: csharpDelegateTargetType("System.Func", [firstBinder, scalar], firstBinder),
    sourceParameter: firstBinder, sourceReturn: firstBinder,
  });
  assert.equal(selected.context === undefined, true, "existing broad-input rejection");
  assert.equal(selected.type === undefined, true);
  assert.equal(selected.aliasTypes.every(type => type === undefined), true);
});

test("unused native receiver parameters retain exact available enclosing generic binders through aliases", () => {
  const selected = fixture("const mapper = (value: T): T => value; const alias = mapper; return invoke(alias);", {
    generic: true, scopedTrailing: true,
  });
  assert.equal(selected.context?.invocationType === selected.scopedType, true, "same exact T in the omitted array argument");
  assert.equal(selected.type === selected.scopedType, true, "no physical ABI adapter at origin");
  assert.equal(selected.aliasTypes.every(type => type === selected.scopedType), true, "one complete ABI at every const alias");
  assert.equal(selected.contract.parameters.length, 1, "authored parameters are not manufactured");
});

test("an unused same-named foreign generic receiver parameter does not become available in the native scope", () => {
  const selected = fixture("const mapper = (value: T): T => value; const alias = mapper; return invoke(alias);", {
    generic: true, scopedTrailing: true, foreignTrailing: true,
  });
  assert.equal(selected.context === undefined, true, "foreign declaration identity cannot be named in the enclosing native scope");
  assert.equal(selected.type === undefined, true);
  assert.equal(selected.aliasTypes.every(type => type === undefined), true);
});

test("available enclosing trailing binders do not weaken unknown-input inference", () => {
  const selected = fixture("const mapper = (value: unknown): T => { throw value; }; return invoke<T>(mapper);", {
    generic: true, scopedTrailing: true,
  });
  assert.equal(selected.context === undefined, true, "broad native input remains independent of omitted receiver ABI");
  assert.equal(selected.type === undefined, true);
});
