import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpSourceCallReceiverSource } from "../../../dist/analysis/source-evidence/types/resolution/receiver-completions.js";
import { completeCsharpSourceCallReceiver } from "../../../dist/analysis/source-evidence/types/resolution/calls.js";

function fixture(kind, projectClass = false) {
  const call = {};
  const expression = {};
  const declaration = {};
  const member = {};
  const source = { call, sourceCallee: { expression, selectedDeclaration: declaration }, sourceResultType: {} };
  const queries = { sourceFile: {} };
  const order = [];
  const ast = {
    kindName: node => node === expression && kind === "super" ? "KindSuperKeyword" : "unit-other",
    parent(node) { order.push("parent"); return node === expression ? member : node === member ? declaration : undefined; },
    hasModifierKind: () => false,
    is: {
      IsArrowFunction: () => false,
      IsFunctionDeclaration: () => false,
      IsFunctionExpression: () => false,
      IsMethodDeclaration: () => false,
      IsGetAccessorDeclaration: () => false,
      IsSetAccessorDeclaration: () => false,
      IsConstructorDeclaration: node => node === member,
      IsPropertyDeclaration: () => false,
      IsClassDeclaration: node => node === declaration && (kind === "super" || projectClass),
      IsClassExpression: () => false,
      IsNewExpression: node => node === call && kind === "new",
    },
  };
  const host = { ast, navigation: { isProjectDeclaration: node => node === declaration && projectClass },
    projectTypeCatalog: { declarationContaining: () => assert.fail("no checked this receiver is present") } };
  const receiverSource = formCsharpSourceCallReceiverSource(host, source, queries);
  const state = { depth: 4, sourceBindings: new Map() };
  return { source, queries, expression, declaration, member, order, host, receiverSource, state };
}

test("synthetic constructing-super retains its actual class occurrence before the native ABI read", () => {
  const unit = fixture("super");
  const source = unit.receiverSource;
  assert.equal(source.kind === "super" && source.source === unit.source && source.queries === unit.queries &&
    source.instance.node === unit.expression && source.instance.kind === "class" &&
    source.instance.member === unit.member && source.instance.declaration === unit.declaration, true);
  assert.deepEqual(unit.order, ["parent", "parent"]);
  const bindings = Object.freeze([{ kind: "type-parameter", identity: "unit:Item", name: "Item" }]);
  const owner = { declaration: unit.declaration, typeParameterBindings: bindings };
  const target = { kind: "target-named", id: "unit:Owner", name: "Owner", typeArguments: bindings };
  const input = { source: unit.source, sourceFile: unit.queries.sourceFile, state: unit.state,
    construction: undefined, receiverSource: source };
  const completed = completeCsharpSourceCallReceiver({ host: { projectTypeABI: () => {
    unit.order.push("abi");
    return { catalog: {
      definitionForDeclaration(node) {
        assert.equal(node === unit.declaration, true, "ABI reads the retained declaration, never a guessed type owner");
        unit.order.push("definition");
        return owner;
      },
      targetTypeForDeclaration(node, arguments_) {
        assert.equal(node === owner.declaration && arguments_ === bindings, true, "actual ABI binder vector is kept");
        unit.order.push("target");
        return target;
      },
    } };
  } } }, input);
  assert.equal(completed?.input === input && completed.kind === "super" && completed.type === target, true);
  assert.deepEqual(unit.order, ["parent", "parent", "abi", "definition", "target"]);
});

test("synthetic unavailable constructing-super does not invent a class or read ABI", () => {
  const unit = fixture("super");
  unit.host.ast.is.IsFunctionDeclaration = node => node === unit.member;
  const receiverSource = formCsharpSourceCallReceiverSource(unit.host, unit.source, unit.queries);
  assert.equal(receiverSource.kind === "super" && receiverSource.instance.kind === "unavailable", true);
  const completed = completeCsharpSourceCallReceiver({ host: {
    projectTypeABI: () => assert.fail("an unavailable original class frame must not request ABI"),
  } }, { source: unit.source, sourceFile: unit.queries.sourceFile, state: unit.state, construction: undefined, receiverSource });
  assert.equal(completed, undefined);
});

test("synthetic New receiver keeps project-class and factory before construction and result in the original states", () => {
  for (const variant of ["project", "factory", "result"]) {
    const unit = fixture("new", variant === "project");
    assert.equal(unit.receiverSource.kind === "construction" && unit.receiverSource.projectClass === (variant === "project"), true);
    const target = { kind: "source-primitive", name: "int32" };
    const factory = { declaration: unit.declaration };
    const factoryTarget = { kind: "target-named", id: "unit:Factory", csharpClassFactory: factory };
    const construction = { contract: { source: unit.source, sourceFile: unit.queries.sourceFile } };
    const order = [];
    const input = { source: unit.source, sourceFile: unit.queries.sourceFile, state: unit.state,
      construction, receiverSource: unit.receiverSource };
    const childState = state => {
      assert.equal(state.depth === unit.state.depth + 1 && state.sourceBindings === unit.state.sourceBindings, true,
        "the original child state and binding identity survive Source capture");
    };
    const completed = completeCsharpSourceCallReceiver({ host: {},
      resolveNodeWithState(node, file, state) {
        assert.equal(node === unit.expression && file === unit.queries.sourceFile, true);
        childState(state);
        order.push("factory");
        return variant === "factory" ? factoryTarget : undefined;
      },
      resolveFormedSourceOwnedConstructionResult(packet, state) {
        assert.equal(packet === construction, true, "the existing construction packet is consumed exactly once");
        childState(state);
        order.push("construction");
        return target;
      },
      resolveTypeWithState(type, file, state) {
        assert.equal(type === unit.source.sourceResultType && file === unit.queries.sourceFile, true);
        childState(state);
        order.push("result");
        return target;
      },
    }, input);
    assert.equal(completed?.input === input && completed.type === target &&
      completed.kind === (variant === "result" ? "construction-result" : "owned-construction"), true);
    assert.equal(variant !== "factory" || completed.factory === factory, true, "the actual factory result is retained");
    assert.deepEqual(order, variant === "project" ? ["construction"] : variant === "factory" ? ["factory", "construction"] : ["factory", "result"]);
  }
});

test("synthetic call receiver rejects retired or foreign Source and missing construction before the chosen child", () => {
  const unit = fixture("super");
  let children = 0;
  const scope = { host: { projectTypeABI: () => { children += 1; return undefined; } } };
  const input = { source: unit.source, sourceFile: unit.queries.sourceFile, state: unit.state,
    construction: undefined, receiverSource: unit.receiverSource };
  assert.throws(() => completeCsharpSourceCallReceiver(scope, { ...input, receiverSource: unit.receiverSource.selected }),
    /exact retained Source receiver/);
  assert.throws(() => completeCsharpSourceCallReceiver(scope, { ...input, receiverSource: { ...unit.receiverSource, source: {} } }),
    /exact retained Source receiver/);
  assert.throws(() => completeCsharpSourceCallReceiver(scope, { ...input,
    receiverSource: { ...unit.receiverSource, instance: { ...unit.receiverSource.instance, node: {} } } }),
    /exact retained Source occurrence/);
  const creation = fixture("new", true);
  assert.throws(() => completeCsharpSourceCallReceiver(scope, { source: creation.source, sourceFile: creation.queries.sourceFile,
    state: creation.state, construction: undefined, receiverSource: creation.receiverSource }), /exact retained source input/);
  assert.equal(children, 0, "invalid retained inputs never reach their actual Native dependency");
});
