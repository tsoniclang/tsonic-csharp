import assert from "node:assert/strict";
import test from "node:test";
import { sourcePrimitiveFactKey } from "@tsonic/tsts";
import { formCsharpSourceValueDeclarationSource, formCsharpSourceValueSource,
  resolveFormedCsharpSourceValueResult } from "../../../dist/analysis/source-evidence/types/resolution/value-source.js";
import { formCsharpPrimitivePreservationSource,
  completeCsharpPrimitivePreservation } from "../../../dist/analysis/source-evidence/types/resolution/primitive-preservation-source.js";
import { collectTargetSourcePrimitiveNames } from "../../../dist/analysis/source-evidence/types/resolution/source-references.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpSourceValueResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";

function fixture(kind = "variable") {
  const unit = { node: {}, declaration: { kind }, callerFile: {}, declarationFile: {}, selectedType: {},
    declaredType: undefined, callerDeclaredType: undefined, initializerType: undefined, literalBase: undefined,
    observations: [], missing: false };
  unit.reference = { declaration: unit.declaration };
  unit.queries = { sourceFile: unit.callerFile, declarations: { declaredValueType: () => unit.callerDeclaredType },
    facts: { authoredTypeSubjects: () => [] }, types: {
      expressionType: () => unit.selectedType, isNonPrimitive: () => false, refinement: () => ({ kind: "exact" }),
      relationship: () => "identical", isUnion: () => false, isNullish: () => false,
    } };
  unit.declarationQueries = { sourceFile: unit.declarationFile,
    declarations: { declaredValueType: () => unit.declaredType }, facts: { authoredTypeSubjects: () => [] }, types: {
      expressionType: () => unit.initializerType, literalBaseType: () => unit.literalBase, isIdentical: (left, right) => left === right,
    } };
  unit.host = { ast: {
    getSourceFile: () => unit.declarationFile, parent: node => node.parent, typeNode: node => node.type,
    variableDeclarationKind: node => node.declarationKind ?? "const",
    as: { AsParenthesizedExpression: node => ({ Expression: node.expression }) },
    is: { IsBindingElement: node => node.kind === "binding", IsParameterDeclaration: node => node.kind === "parameter",
      IsVariableDeclaration: node => node.kind === "variable", IsArrayLiteralExpression: node => node.kind === "array",
      IsTypeAliasDeclaration: () => false, IsInterfaceDeclaration: () => false, IsTypeParameterDeclaration: () => false,
      IsArrowFunction: () => false, IsFunctionExpression: () => false,
      IsParenthesizedExpression: node => node.kind === "parenthesized", IsSatisfiesExpression: () => false,
      IsCallExpression: () => false, IsNewExpression: () => false },
  }, navigation: { referenceFor(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("reference");
    return unit.missing ? undefined : unit.reference;
  } }, semantics(file) {
    assert.equal(file === unit.declarationFile, true, "the selected declaration owns its checked queries");
    unit.observations.push("declaration-queries");
    return unit.declarationQueries;
  }, hasSemantics(file) {
    assert.equal(file === unit.declarationFile, true, "the synthetic annotation file has no owned checked Source");
    unit.observations.push("authored-availability");
    return false;
  }, structuralTypes: { resolveTarget: () => undefined }, targetTypeComponents: () => [] };
  unit.scope = { host: unit.host,
    sourceValueDeclaration(node, declaration) {
      assert.equal(node === unit.node && declaration === (unit.missing ? undefined : unit.declaration), true);
      unit.observations.push("selection");
      return declaration;
    },
    sourceValueDeclarationSyntax(declaration) {
      assert.equal(declaration === unit.declaration, true);
      unit.observations.push("syntax");
      return { type: declaration.type, initializer: declaration.initializer };
    },
    sourceCallSelectedDeclaration: () => assert.fail("these synthetic initializer leaves have no call declaration"),
    collectTargetSourcePrimitiveNames: (...args) => collectTargetSourcePrimitiveNames(unit.scope, ...args),
    resolveTypeWithState: () => assert.fail("unexpected Native Type child"),
    resolveNodeWithState: () => assert.fail("unexpected Native Node child"),
    resolveNodeValueWithState: () => assert.fail("unexpected Native value child"),
  };
  unit.state = { depth: 4, sourceBindings: new Map(), sourceStorageBindings: {}, sourceStorageSubject: {},
    rejectNativeResolution: () => assert.fail("explicit synthetic leaves have no rejection") };
  return unit;
}

function capture(unit) {
  return formCsharpSourceValueSource(unit.scope, formCsharpSourceValueDeclarationSource(unit.scope, unit.node),
    unit.queries, unit.state, unit.selectedType);
}

function forbidSource(unit) {
  unit.host.ast = undefined;
  unit.host.navigation = undefined;
  unit.host.semantics = () => assert.fail("formed value completion cannot select a checker again");
  unit.host.hasSemantics = () => assert.fail("formed value completion cannot collect authored Source again");
  if (unit.host.sourceFacts !== undefined) unit.host.sourceFacts.getFact = () => assert.fail("formed value completion cannot read Source facts");
  for (const query of [unit.queries, unit.declarationQueries]) for (const family of [query.types, query.declarations, query.facts]) {
    for (const key of Object.keys(family)) family[key] = () => assert.fail("formed value completion cannot query Source again");
  }
  unit.scope.sourceValueDeclaration = () => assert.fail("formed completion cannot select a declaration again");
  unit.scope.sourceValueDeclarationSyntax = () => assert.fail("formed completion cannot read declaration syntax again");
}

test("synthetic value Source keeps genuine declaration absence and rejects retired selection inputs", () => {
  const unit = fixture();
  unit.missing = true;
  const input = capture(unit);
  assert.equal(input.kind === "missing" && input.selection.reference === undefined && input.node === unit.node &&
    input.queries === unit.queries && input.state === unit.state && input.selectedType === unit.selectedType, true);
  assert.deepEqual(unit.observations, ["reference", "selection"]);
  forbidSource(unit);
  assert.equal(resolveFormedCsharpSourceValueResult({}, input), undefined);
  assert.throws(() => formCsharpSourceValueSource({}, unit.node, unit.queries, unit.state, unit.selectedType), /retained declaration selection/u);
  assert.throws(() => resolveFormedCsharpSourceValueResult({}, { node: unit.node, queries: unit.queries, state: unit.state }), /exact retained Source declaration/u);
});

test("synthetic binding Source consumes the exact declaration carrier without an unused selected-Type query", () => {
  const unit = fixture("binding");
  unit.queries.types.expressionType = () => assert.fail("a binding without an annotation never selects a checked value Type");
  const input = capture(unit);
  assert.equal(input.kind === "binding" && input.selection.reference === unit.reference && input.declaration === unit.declaration &&
    input.sourceFile === unit.declarationFile && input.authored === undefined && input.body === undefined, true);
  forbidSource(unit);
  const integer = csharpSourcePrimitiveTargetType("int64");
  let projections = 0;
  unit.host.bindingProjection = (declaration, file) => {
    assert.equal(declaration === unit.declaration && file === unit.declarationFile, true);
    projections += 1;
    return { bindingCarrier: integer };
  };
  const result = resolveFormedCsharpSourceValueResult(unit.scope, input);
  assert.equal(result.selectedType === integer && projections === 1 && input.state === unit.state, true);
});

test("synthetic value annotation keeps caller and declaration origins before its Native parameter child", () => {
  const unit = fixture("parameter");
  unit.declaration.type = {};
  unit.declaration.parent = {};
  const unavailable = new Error("synthetic declaration checker is genuinely unavailable");
  unit.host.semantics = file => {
    assert.equal(file === unit.declarationFile, true);
    throw unavailable;
  };
  const input = capture(unit);
  assert.equal(input.authored.authoredSourceFile === unit.declarationFile && input.authored.selectedSourceFile === unit.callerFile &&
    input.authored.selectedType === unit.selectedType && input.authored.inputState === unit.state &&
    input.nativeParameter.owner === unit.declaration.parent && input.body.kind === "unavailable" && input.body.error === unavailable, true);
  assert.equal(unit.observations.filter(value => value === "syntax").length === 1, true, "contextual capture uses the same already-retained syntax");
  forbidSource(unit);
  const integer = csharpSourcePrimitiveTargetType("int64");
  const order = [];
  unit.scope.resolveTypeWithState = (type, file, state) => {
    assert.equal(type === unit.selectedType && file === unit.callerFile && state.depth === unit.state.depth + 1 &&
      state.sourceBindings === unit.state.sourceBindings && state.sourceStorageSubject === unit.state.sourceStorageSubject &&
      state.sourceStorageBindings === unit.state.sourceStorageBindings && state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
    order.push("annotation");
    return integer;
  };
  unit.host.objectShapes = { resolveNativeParameter(owner, parameter, type) {
    assert.equal(owner === unit.declaration.parent && parameter === unit.declaration && type === integer, true);
    order.push("native-parameter");
    return { kind: "resolved", type };
  } };
  assert.equal(resolveFormedCsharpSourceValueResult(unit.scope, input).selectedType === integer, true);
  assert.deepEqual(order, ["annotation", "native-parameter"]);
  unit.scope.resolveTypeWithState = () => undefined;
  assert.throws(() => resolveFormedCsharpSourceValueResult(unit.scope, input), error => error === unavailable,
    "only the original body demand consumes the same captured checker failure after an unavailable annotation");
});

test("synthetic uninitialized value keeps declared, selected and Native parameter order with genuine selected absence", () => {
  const unit = fixture("parameter");
  unit.declaration.parent = {};
  unit.selectedType = undefined;
  unit.declaredType = {};
  const input = capture(unit);
  assert.equal(input.body.declared.type === unit.declaredType && input.body.declared.sourceFile === unit.declarationFile &&
    input.body.selected.type === undefined && input.body.selected.sourceFile === unit.callerFile &&
    input.body.tail.contextual.kind === "not-applicable", true);
  assert.equal(unit.observations.filter(value => value === "syntax").length === 1, true);
  forbidSource(unit);
  const integer = csharpSourcePrimitiveTargetType("int64");
  const order = [];
  unit.scope.resolveTypeWithState = (type, file, state) => {
    assert.equal(state.depth === unit.state.depth + 1 && state.sourceBindings === unit.state.sourceBindings, true);
    if (type === unit.declaredType) { assert.equal(file === unit.declarationFile, true); order.push("declared"); return integer; }
    assert.equal(type === undefined && file === unit.callerFile, true);
    order.push("selected");
    return undefined;
  };
  unit.host.objectShapes = { resolveNativeParameter(owner, parameter, type) {
    assert.equal(owner === unit.declaration.parent && parameter === unit.declaration && type === integer, true);
    order.push("native-parameter");
    return { kind: "resolved", type };
  } };
  assert.equal(resolveFormedCsharpSourceValueResult(unit.scope, input).selectedType === integer, true);
  assert.deepEqual(order, ["declared", "selected", "native-parameter"]);
});

test("synthetic initializer keeps its retained expression and original value receipt while arrays never fall back to declared storage", () => {
  const unit = fixture();
  const expression = {};
  unit.declaration.initializer = { kind: "parenthesized", expression };
  unit.declaredType = {};
  const input = capture(unit);
  assert.equal(input.body.tail.expression.node === unit.declaration.initializer && input.body.tail.expression.expression === expression &&
    input.body.tail.expression.queries === unit.declarationQueries && input.body.tail.refinement === undefined, true);
  forbidSource(unit);
  const integer = csharpSourcePrimitiveTargetType("int64");
  const expected = csharpSourceValueResult(integer);
  const order = [];
  unit.scope.resolveTypeWithState = (type, file) => { assert.equal(type === unit.declaredType && file === unit.declarationFile, true); order.push("declared"); return undefined; };
  unit.scope.resolveNodeValueWithState = (node, file, state) => {
    assert.equal(node === expression && file === unit.declarationFile && state.depth === unit.state.depth + 2 &&
      state.sourceBindings === unit.state.sourceBindings && state.sourceStorageSubject === unit.state.sourceStorageSubject, true);
    order.push("initializer");
    return expected;
  };
  assert.equal(resolveFormedCsharpSourceValueResult(unit.scope, input) === expected, true, "the original factory/value receipt is not reconstructed");
  assert.deepEqual(order, ["declared", "initializer"]);
  const array = fixture();
  array.declaration.initializer = { kind: "array" };
  array.declaredType = {};
  array.host.sourceFacts = { getFact: () => assert.fail("the array Source branch has no unused direct fact candidate") };
  array.host.ast.is.IsParenthesizedExpression = () => assert.fail("the array Source branch has no unused expression candidate");
  const arrayInput = capture(array);
  assert.equal(arrayInput.body.tail.array && arrayInput.body.tail.direct === undefined && arrayInput.body.tail.expression === undefined, true);
  forbidSource(array);
  array.scope.resolveTypeWithState = () => integer;
  array.scope.resolveNodeValueWithState = (node, file, state) => {
    assert.equal(node === array.declaration.initializer && file === array.declarationFile && state.depth === array.state.depth + 1, true);
    return undefined;
  };
  assert.equal(resolveFormedCsharpSourceValueResult(array.scope, arrayInput), undefined);
});

test("synthetic mutable widening consumes the same captured primitive requirement without a late Source read or initializer child", () => {
  const unit = fixture();
  unit.node = unit.declaration;
  unit.declaration.declarationKind = "let";
  unit.declaration.initializer = { kind: "literal" };
  unit.declaredType = {};
  unit.initializerType = {};
  unit.literalBase = unit.declaredType;
  const subject = {};
  unit.declarationQueries.facts.authoredTypeSubjects = node => { assert.equal(node === unit.declaration.initializer, true); return [subject]; };
  unit.host.sourceFacts = { getFact: (node, key) => node === subject && key === sourcePrimitiveFactKey ? { kind: "int64" } : undefined };
  const input = capture(unit);
  assert.equal(input.body.tail.mutable && input.body.tail.widening && input.body.tail.preservation.node === unit.declaration.initializer &&
    input.body.tail.preservation.queries === unit.declarationQueries && input.body.tail.refinement === undefined, true);
  assert.deepEqual(input.body.tail.preservation.required, ["int64"]);
  const separate = formCsharpPrimitivePreservationSource(unit.scope, unit.declaration.initializer, unit.declarationQueries);
  forbidSource(unit);
  const integer = csharpSourcePrimitiveTargetType("int64");
  assert.equal(completeCsharpPrimitivePreservation(unit.scope, separate, integer), true);
  assert.equal(completeCsharpPrimitivePreservation(unit.scope, separate, csharpSourcePrimitiveTargetType("int32")), false);
  let declared = 0;
  unit.scope.resolveTypeWithState = (type, file) => { assert.equal(type === unit.declaredType && file === unit.declarationFile, true); declared += 1; return integer; };
  assert.equal(resolveFormedCsharpSourceValueResult(unit.scope, input).selectedType === integer && declared === 1, true);
});

test("synthetic counted induction keeps its bound before declared children and preserves the original integer-only guard", () => {
  const unit = fixture();
  unit.declaredType = {};
  const statement = {};
  const start = {};
  const bound = {};
  const loop = { counterDeclaration: unit.declaration, start, bound };
  unit.declaration.parent = { parent: statement };
  unit.host.ast.is.IsForStatement = node => node === statement;
  unit.host.ast.is.IsNumericLiteral = node => node === start;
  unit.host.ast.as.AsForStatement = () => ({ Incrementor: {} });
  unit.host.ast.text = node => node === start ? "0" : "";
  unit.host.navigation.countedLoop = node => node === statement ? loop : undefined;
  unit.host.navigation.declarationUseSummary = () => ({ captured: false, exported: false, memberWritten: false, uses: [] });
  const input = capture(unit);
  assert.equal(input.body.induction === loop && input.body.inductionState.depth === unit.state.depth + 1 &&
    input.body.inductionState.sourceBindings === unit.state.sourceBindings, true);
  forbidSource(unit);
  const fallback = csharpSourcePrimitiveTargetType("int32");
  for (const name of ["int64", "float64"]) {
    const order = [];
    const nativeBound = csharpSourcePrimitiveTargetType(name);
    unit.scope.resolveNodeWithState = (node, file, state) => {
      assert.equal(node === bound && file === unit.declarationFile && state === input.body.inductionState, true);
      order.push("induction");
      return nativeBound;
    };
    unit.scope.resolveTypeWithState = (type, file) => {
      assert.equal(type === unit.declaredType ? file === unit.declarationFile : type === unit.selectedType && file === unit.callerFile, true);
      order.push(type === unit.declaredType ? "declared" : "selected");
      return type === unit.declaredType ? fallback : undefined;
    };
    const result = resolveFormedCsharpSourceValueResult(unit.scope, input);
    assert.equal(result.selectedType === (name === "int64" ? nativeBound : fallback), true);
    assert.deepEqual(order, name === "int64" ? ["induction"] : ["induction", "declared", "selected"]);
  }
});

test("synthetic value completion rejects foreign declaration, parameter and initializer packets before Native children", () => {
  const unit = fixture();
  unit.declaration.initializer = { kind: "parenthesized", expression: {} };
  const input = capture(unit);
  const noChildren = { resolveTypeWithState: () => assert.fail("invalid Source cannot enter a Native Type child"),
    resolveNodeWithState: () => assert.fail("invalid Source cannot enter a Native Node child") };
  assert.throws(() => resolveFormedCsharpSourceValueResult(noChildren, { ...input, declaration: {} }), /exact retained Source declaration/u);
  assert.throws(() => resolveFormedCsharpSourceValueResult(noChildren,
    { ...input, nativeParameter: { ...input.nativeParameter, parameter: {} } }), /exact retained Source declaration/u);
  assert.throws(() => resolveFormedCsharpSourceValueResult(noChildren, { ...input,
    body: { ...input.body, tail: { ...input.body.tail, expression: { ...input.body.tail.expression, node: {} } } } }),
    /exact retained initializer or contextual Source/u);
  assert.throws(() => resolveFormedCsharpSourceValueResult(noChildren, { ...input,
    body: { ...input.body, selected: { ...input.body.selected, type: {} } } }), /exact retained declaration children/u);
});
