import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { analyzeCsharpCallableContracts } from "../../../dist/analysis/callables/analyze.js";
import { analyzeCsharpCallableCreations } from "../../../dist/analysis/callables/values/creation.js";
import { csharpCallableValueType } from "../../../dist/policy/types/callables/value-type.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";

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
  const nodes = [];
  const visit = node => {
    nodes.push(node);
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
  let destinationReads = 0;
  const operations = { selectedConstruction: { get: () => undefined }, selectedCall: { get(node) {
    destinationReads++;
    const target = source.ast.text(source.ast.as.AsCallExpression(node).Expression);
    const type = target === "other" ? overrides.otherType ?? scopedType ?? selectedType : overrides.type ?? scopedType ?? selectedType;
    return { target: { kind: "resolved", call: {
      origin: overrides.origin ?? "source-profile",
      ...(overrides.effect === false ? {} : { invocationOnlyCallableArgumentIndexes: Object.freeze([0]) }),
      arguments: Object.freeze([{ sourceArgumentIndex: 0, sourceForm: "value", targetParameter: {
        type, passingMode: "by-value",
      } }]),
    } } };
  } } };
  const objectShapes = Object.freeze({
    resolveNativeParameter(declaration, parameter, type) {
      assert.equal(source.ast.is.IsParameterDeclaration(parameter), true, "checked native value parameter");
      assert.equal(source.ast.parent(parameter) === declaration, true, "original implementation owns its parameter");
      const present = getCsharpNullableElementTargetType(type) ?? type;
      assert.equal(present.kind !== "target-named" ||
        present.csharpStructuralContract !== true && present.csharpSourceDeclarationKind !== "interface", true,
        "this fixture has no structural native parameter selection");
      return Object.freeze({ kind: "resolved", type });
    },
    resolveNode: () => undefined,
    resolveTarget: () => undefined,
  });
  const policy = { ast: source.ast, sourceFiles: [file], navigation: source.navigation, objectShapes,
    sourceStorage: createSourceStorageQuery(source, [file]),
    semantics: sourceFile => source.semantics.forFile(sourceFile),
    semanticsFor: node => source.semantics.forNode(node),
    projectTypes: { catalog: { definitions: [] } },
  };
  const evidence = { compileTimeMetadata: { get: () => false },
    generatorTargetType: { get: () => undefined },
    contextualType: { get: () => undefined },
    nodeTargetType: { get: node => source.ast.is.IsArrayTypeNode(node)
      ? csharpJsArrayTargetType(scalar) : overrides.sourceParameter ?? scopedBinder ?? scalar } };
  const declarations = { runtimeDefault: { get: () => undefined },
    returnContract: { get: node => ({ kind: "resolved", type: node === lambda ? overrides.sourceReturn ?? scopedBinder ?? scalar : scalar }) } };
  const names = { resolve: node => ({ kind: "resolved", name: source.ast.text(node) }) };
  const analyzed = analyzeCsharpCallableContracts(policy, evidence, declarations, names, { genericProjection: Object.freeze({ get: () => [] }) }, source,
    Object.freeze({ typeDefinitions: undefined, projectTypes: policy.projectTypes, providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {},
      objectShapes, conversion: { get() { throw new Error("This fixture has no contextual native parameter adaptation."); } } }), operations);
  const contract = analyzed.get({ kind: "declaration", declaration: lambda });
  assert.equal(contract !== undefined, true, "the original declaration has its completed native ABI");
  const nativeCarrier = csharpCallableValueType(contract);
  const creations = analyzeCsharpCallableCreations({ source, nodes, contracts: analyzed, operations,
    captures: { captureClosure: { get: () => undefined }, namedSelf: { get: () => undefined },
      lexicalCaptures: [{ owner: lambda, values: [], receivers: [] }] },
    storage: { lambdaParameterType: { get: parameter => contract.nativeParameters.find(entry => entry.sourceParameter === parameter)?.targetParameter.type },
      storageType: { get: declaration => source.ast.is.IsVariableDeclaration(declaration) ? nativeCarrier : undefined } },
    evidence, conversions: { conversion: { get: (sourceType, targetType) => targetTypeRefEquals(sourceType, targetType) ? { kind: "identity" } : undefined } },
    literals: { literalValue: { get: () => undefined } } });
  return { scopedType, creation: creations.callableCreation.get(lambda), nativeCarrier, contract, lambda, source,
    destinationReads, sourceParameter: overrides.sourceParameter ?? scopedBinder ?? scalar,
    sourceReturn: overrides.sourceReturn ?? scopedBinder ?? scalar,
    aliasTypes: source.navigation.expressionValueFlow(lambda).aliasDeclarations.map(alias => analyzed.closedInputType(alias)),
  };
}

function declaredCreation(selected) {
  assert.equal(selected.creation?.kind, "selected", "approved C-1394: the actual declaration owns one completed creation");
  assert.equal(targetTypeRefEquals(selected.creation.carrier, selected.nativeCarrier), true,
    "the original declaration's native contract, never a later destination, selects the carrier");
  assert.equal(selected.contract.sourceDeclaration === selected.lambda, true, "the checked original declaration owns the native contract");
  assert.equal(selected.contract.parameters.length, selected.source.ast.parameters(selected.lambda).length,
    "no unused destination parameter is manufactured in the source contract");
  const optional = selected.source.ast.questionToken(selected.contract.parameters[0]) !== undefined;
  const input = selected.contract.nativeParameters[0].targetParameter.type;
  assert.equal(targetTypeRefEquals(input, optional ? csharpNullableTargetType(selected.sourceParameter) : selected.sourceParameter), true,
  "the original native input, optional or rest contract stays exact");
  assert.equal(targetTypeRefEquals(selected.contract.returnType, selected.sourceReturn), true, "native return width, absence and binder stay exact");
  assert.equal(selected.aliasTypes.every(type => type === undefined), true, "no origin or alias receives a copied physical ABI");
  assert.equal(selected.destinationReads, 0, "later native destinations are not read to retype this declaration");
  assert.equal(Object.isFrozen(selected.creation) && Object.isFrozen(selected.creation.allocation), true, "one immutable creation and native form");
}

test("a single exact selected invocation ABI survives strict immutable aliases without changing the authored contract", () => {
  const selected = fixture("const mapper = (value: number): number => value + 1; const alias = mapper; invoke(alias); return invoke(mapper);");
  declaredCreation(selected);
  assert.equal(selected.aliasTypes.length, 2, "exact origin and const alias declarations");
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
    declaredCreation(selected);
    assert.equal(selected.creation.allocation.kind, "fresh", name + ": the written value is not history-cached");
  });
}

for (const [name, overrides] of [
  ["parameter width", { sourceParameter: integer }],
  ["return width", { sourceReturn: integer }],
  ["native absence", { sourceReturn: csharpNullableTargetType(scalar) }],
]) {
  test(`selected invocation ABI cannot erase exact ${name}`, () => {
    const selected = fixture("const mapper = (value: number): number => value; return invoke(mapper);", overrides);
    declaredCreation(selected);
    assert.equal(targetTypeRefEquals(selected.contract.nativeParameters[0].targetParameter.type,
      overrides.sourceParameter ?? scalar), true, "exact native parameter width");
    assert.equal(targetTypeRefEquals(selected.contract.returnType, overrides.sourceReturn ?? scalar), true, name);
  });
}

for (const [name, body] of [
  ["source optional parameter", "const mapper = (value?: number): number => value ?? 0; return invoke(mapper);"],
  ["source rest parameter", "const mapper = (value: number, ...indexes: number[]): number => value; return invoke(mapper);"],
]) {
  test(`selected invocation ABI does not replace a ${name} contract`, () => {
    const selected = fixture(body);
    declaredCreation(selected);
    const parameter = selected.contract.parameters[name === "source optional parameter" ? 0 : 1];
    assert.equal(name === "source optional parameter" ? selected.source.ast.questionToken(parameter) !== undefined
      : selected.source.ast.as.AsParameterDeclaration(parameter)?.DotDotDotToken !== undefined, true,
    name + ": the original authored parameter remains");
  });
}

test("existing broad-input closure is preserved independently of invocation-only allocation policy", () => {
  const selected = fixture("const mapper = (value: unknown): number => 1; return invoke(mapper);", { origin: "provider" });
  declaredCreation(selected);
  assert.equal(selected.contract.nativeParameters[0].targetParameter.type === scalar, true);
});

test("exact enclosing generic binder identities close one native ABI without changing source parameters", () => {
  const type = csharpDelegateTargetType("System.Func", [firstBinder, scalar], firstBinder);
  const selected = fixture("const mapper = (value: T): T => value; const alias = mapper; return invoke(alias);",
    { generic: true, type, sourceParameter: firstBinder, sourceReturn: firstBinder });
  declaredCreation(selected);
  assert.equal(selected.contract.nativeParameters[0].targetParameter.type === firstBinder &&
    selected.contract.returnType === firstBinder, true, "exact inherited binder identity, without a destination parameter");
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
    declaredCreation(selected);
    assert.equal(selected.contract.nativeParameters[0].targetParameter.type === firstBinder &&
      selected.contract.returnType === firstBinder, true, name + ": foreign destination binders never enter the declaration");
  });
}

test("broad inference still cannot invent an enclosing generic binder", () => {
  const selected = fixture("const mapper = (value: unknown): T => { throw value; }; return invoke<T>(mapper);", {
    generic: true, type: csharpDelegateTargetType("System.Func", [firstBinder, scalar], firstBinder),
    sourceParameter: firstBinder, sourceReturn: firstBinder,
  });
  declaredCreation(selected);
  assert.equal(selected.contract.nativeParameters[0].targetParameter.type === firstBinder, true,
    "the fixture's exact declared native input is not inferred from its later destination");
});

test("unused native receiver parameters retain exact available enclosing generic binders through aliases", () => {
  const selected = fixture("const mapper = (value: T): T => value; const alias = mapper; return invoke(alias);", {
    generic: true, scopedTrailing: true,
  });
  declaredCreation(selected);
  assert.equal(selected.contract.nativeParameters[0].targetParameter.type === selected.sourceParameter &&
    selected.contract.returnType === selected.sourceReturn, true, "the exact checked enclosing binder remains available");
  assert.equal(selected.contract.parameters.length, 1, "authored parameters are not manufactured");
});

test("an unused same-named foreign generic receiver parameter does not become available in the native scope", () => {
  const selected = fixture("const mapper = (value: T): T => value; const alias = mapper; return invoke(alias);", {
    generic: true, scopedTrailing: true, foreignTrailing: true,
  });
  declaredCreation(selected);
  assert.equal(selected.contract.nativeParameters[0].targetParameter.type === selected.sourceParameter &&
    selected.contract.returnType === selected.sourceReturn, true,
  "the foreign same-named destination binder is not the source's checked enclosing binder");
});

test("available enclosing trailing binders do not weaken unknown-input inference", () => {
  const selected = fixture("const mapper = (value: unknown): T => { throw value; }; return invoke<T>(mapper);", {
    generic: true, scopedTrailing: true,
  });
  declaredCreation(selected);
  assert.equal(selected.contract.nativeParameters.length, 1, "no trailing destination input narrows the original declaration");
});
