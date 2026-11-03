import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpSemanticConditionalSource, resolveFormedCsharpSemanticConditionalType } from "../../../dist/analysis/source-evidence/types/resolution/semantic-conditional-source.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function syntheticSource(count = 2) {
  const type = {};
  const sourceFile = {};
  const declaration = {};
  const conditional = {};
  const selectedNode = {};
  const checkedArguments = Array.from({ length: count }, () => ({}));
  const argumentDeclarations = checkedArguments.map(() => ({}));
  const symbols = checkedArguments.map(() => ({}));
  const bindings = checkedArguments.map(argument => ({ declaration: {}, parameter: {}, argument }));
  const application = { kind: "conditional", declaration, typeNode: conditional, bindings, result: {},
    conditionalSteps: [{ conditional, branch: "true", selectedNode, selectedType: {}, bindings: [] }] };
  const observations = [];
  const queries = { sourceFile, declarations: {
    typeSymbol(argument) {
      observations.push("symbol");
      return symbols[checkedArguments.indexOf(argument)];
    },
    symbolDeclarations(symbol) {
      observations.push("declaration");
      return [argumentDeclarations[symbols.indexOf(symbol)]];
    },
  }, types: {
    aliasApplication: () => assert.fail("the Source caller supplies the actual already-checked alias row"),
    instantiateAlias: () => assert.fail("unchanged checked arguments do not instantiate another alias"),
  } };
  const host = { ast: {
    parent: node => node === conditional ? declaration : undefined,
    typeNode: node => node === declaration ? conditional : undefined,
    getSourceFile: () => sourceFile,
    is: { IsParenthesizedTypeNode: () => false, IsTypeAliasDeclaration: node => node === declaration,
      IsConditionalTypeNode: node => node === conditional },
  }, navigation: { isProjectDeclaration: node => node === declaration } };
  const state = { depth: 3, sourceBindings: new Map() };
  return { type, sourceFile, declaration, selectedNode, checkedArguments, argumentDeclarations,
    application, observations, queries, host, state };
}

function capture(unit, application) {
  return formCsharpSemanticConditionalSource({ host: unit.host }, unit.type, unit.queries, unit.state, application);
}

function forbidSourceQueries(unit) {
  unit.queries.declarations.typeSymbol = () => assert.fail("argument symbols were captured before Native");
  unit.queries.declarations.symbolDeclarations = () => assert.fail("argument declarations were captured before Native");
  unit.queries.types.instantiateAlias = () => assert.fail("checked reinstantiation was completed at Source");
}

test("synthetic semantic conditional keeps exact alias and binder rows before the original ordered Native children", () => {
  const unit = syntheticSource();
  const first = csharpSourcePrimitiveTargetType("int32");
  const second = csharpSourcePrimitiveTargetType("int64");
  unit.state.sourceBindings.set(unit.argumentDeclarations[0], { sourceType: unit.checkedArguments[0], targetType: first });
  const input = capture(unit, unit.application);
  assert.equal(input.kind === "application" && input.sourceApplication === unit.application && input.application === unit.application &&
    input.type === unit.type && input.queries === unit.queries && input.state === unit.state && input.declaration === unit.declaration, true);
  assert.equal(input.arguments.every((argument, index) => argument.binding === unit.application.bindings[index] &&
    argument.source.type === unit.checkedArguments[index] && argument.source.declarations[0] === unit.argumentDeclarations[index] &&
    argument.selectedSourceType === unit.checkedArguments[index]), true);
  assert.deepEqual(unit.observations, ["symbol", "declaration", "symbol", "declaration"]);
  forbidSourceQueries(unit);
  const order = [];
  const native = csharpSourcePrimitiveTargetType("uint32");
  const result = resolveFormedCsharpSemanticConditionalType({ host: unit.host,
    resolveTypeWithState(type, file, state) {
      assert.equal(type === unit.checkedArguments[1] && file === unit.sourceFile && state.depth === unit.state.depth + 1 &&
        state.sourceBindings === unit.state.sourceBindings, true);
      order.push("argument1");
      return second;
    },
    resolveNodeWithState(node, file, state) {
      assert.equal(node === unit.selectedNode && file === unit.sourceFile && state.depth === unit.state.depth + 1 &&
        state.sourceBindings !== unit.state.sourceBindings, true);
      assert.equal(state.sourceBindings.get(unit.application.bindings[0].declaration).targetType === first &&
        state.sourceBindings.get(unit.application.bindings[1].declaration).targetType === second, true);
      assert.equal(state.sourceBindings.get(unit.application.bindings[0].declaration).sourceType === unit.checkedArguments[0] &&
        state.sourceBindings.get(unit.application.bindings[1].declaration).sourceType === unit.checkedArguments[1], true);
      order.push("branch");
      return native;
    },
  }, input);
  assert.equal(result.type === native && unit.state.sourceBindings.size === 1, true);
  assert.deepEqual(order, ["argument1", "branch"]);
  assert.deepEqual(unit.observations, ["symbol", "declaration", "symbol", "declaration"]);
});

test("synthetic semantic conditional reinstantiates with actual bound Source Types and keeps the selected argument origin", () => {
  const unit = syntheticSource(1);
  const replacement = {};
  const oldNative = csharpSourcePrimitiveTargetType("int32");
  unit.state.sourceBindings.set(unit.argumentDeclarations[0], { sourceType: replacement, targetType: oldNative });
  const selected = { ...unit.application, bindings: [{ ...unit.application.bindings[0], argument: replacement }] };
  let instantiations = 0;
  unit.queries.types.instantiateAlias = (declaration, sources) => {
    assert.equal(declaration === unit.declaration && sources.length === 1 && sources[0] === replacement, true);
    instantiations += 1;
    return selected;
  };
  const input = capture(unit, unit.application);
  assert.equal(input.kind === "application" && input.sourceApplication === unit.application && input.application === selected &&
    input.arguments[0].binding === selected.bindings[0] && input.arguments[0].source === undefined &&
    input.arguments[0].selectedSourceType === replacement && instantiations === 1, true);
  forbidSourceQueries(unit);
  const actual = csharpSourcePrimitiveTargetType("int64");
  let children = 0;
  const result = resolveFormedCsharpSemanticConditionalType({ host: unit.host,
    resolveTypeWithState(type, file, state) {
      assert.equal(type === replacement && file === unit.sourceFile && state.sourceBindings === unit.state.sourceBindings, true);
      children += 1;
      return actual;
    },
    resolveNodeWithState(node, file, state) {
      assert.equal(node === unit.selectedNode && file === unit.sourceFile &&
        state.sourceBindings.get(selected.bindings[0].declaration).sourceType === replacement &&
        state.sourceBindings.get(selected.bindings[0].declaration).targetType === actual, true);
      return actual;
    },
  }, input);
  assert.equal(result.type === actual && children === 1 && instantiations === 1 &&
    unit.application.bindings[0].argument === unit.checkedArguments[0], true);
});

test("synthetic semantic conditional keeps not-applicable, unavailable reinstantiation and ALL-child failure distinct", () => {
  const unit = syntheticSource(1);
  const noChildren = { resolveTypeWithState: () => assert.fail("unavailable conditional before Native argument children"),
    resolveNodeWithState: () => assert.fail("unavailable conditional before Native branch children") };
  const missing = capture(unit, undefined);
  assert.equal(missing.kind === "not-applicable" && resolveFormedCsharpSemanticConditionalType(noChildren, missing) === undefined, true);
  const direct = capture(unit, { ...unit.application, kind: "direct" });
  assert.equal(direct.kind === "not-applicable" && resolveFormedCsharpSemanticConditionalType(noChildren, direct) === undefined, true);
  unit.state.sourceBindings.set(unit.argumentDeclarations[0], { sourceType: {}, targetType: csharpSourcePrimitiveTargetType("int32") });
  unit.queries.types.instantiateAlias = () => undefined;
  const unavailable = capture(unit, unit.application);
  const declined = resolveFormedCsharpSemanticConditionalType(noChildren, unavailable);
  assert.equal(unavailable.kind === "unavailable" && declined !== undefined && declined.type === undefined, true);
  const all = syntheticSource();
  all.state = { depth: 3 };
  all.queries.declarations.typeSymbol = () => assert.fail("no source bindings means no owned binder query");
  const input = capture(all, all.application);
  assert.equal(input.kind === "application" && input.arguments.every(argument => argument.source === undefined), true);
  const order = [];
  const completed = resolveFormedCsharpSemanticConditionalType({ host: all.host,
    resolveTypeWithState(type, file, state) {
      const index = all.checkedArguments.indexOf(type);
      assert.equal(index >= 0 && file === all.sourceFile && state.depth === all.state.depth + 1, true);
      order.push(index);
      return index === 0 ? undefined : csharpSourcePrimitiveTargetType("int32");
    },
    resolveNodeWithState: () => assert.fail("an unavailable argument cannot enter the selected branch"),
  }, input);
  assert.equal(completed !== undefined && completed.type === undefined, true);
  assert.deepEqual(order, [0, 1]);
});

test("synthetic semantic conditional rejects sparse, foreign, changed and retired Source inputs before Native children", () => {
  const unit = syntheticSource();
  const input = capture(unit, unit.application);
  const noChildren = { resolveTypeWithState: () => assert.fail("foreign Source before Native children") };
  const sparse = [...input.arguments];
  delete sparse[1];
  assert.throws(() => resolveFormedCsharpSemanticConditionalType(noChildren, { ...input, arguments: sparse }), /every exact ordered bound argument Source/u);
  assert.throws(() => resolveFormedCsharpSemanticConditionalType(noChildren,
    { ...input, arguments: [input.arguments[1], input.arguments[0]] }), /every exact ordered bound argument Source/u);
  assert.throws(() => resolveFormedCsharpSemanticConditionalType(noChildren,
    { ...input, arguments: [{ ...input.arguments[0], source: { ...input.arguments[0].source, type: {} } }, input.arguments[1]] }),
    /every exact ordered bound argument Source/u);
  assert.throws(() => resolveFormedCsharpSemanticConditionalType(noChildren,
    { queries: unit.queries, application: unit.application }), /exact retained Source application/u);
  unit.state.sourceBindings.set(unit.argumentDeclarations[0], { sourceType: {}, targetType: csharpSourcePrimitiveTargetType("int32") });
  assert.throws(() => resolveFormedCsharpSemanticConditionalType(noChildren, input), /every exact ordered bound argument Source/u);
});
