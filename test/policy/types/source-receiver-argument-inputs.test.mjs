import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpSourceTypeArguments, bindCsharpSourceTypeArgumentsSource,
  resolveFormedCsharpSourceTypeArguments } from "../../../dist/analysis/source-evidence/types/resolution/generic-arguments.js";
import { formCsharpSourceCallContractSource } from "../../../dist/analysis/source-evidence/types/resolution/call-contracts.js";
import { resolveSourceCallSelectedType } from "../../../dist/analysis/source-evidence/types/resolution/calls.js";

test("synthetic checked receiver arguments bind the same capture to each actual state without another query", () => {
  const receiver = {};
  const declaration = {};
  const argumentType = {};
  const file = {};
  const bindings = Object.freeze([Object.freeze({ declaration, argumentType })]);
  const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
  let reads = 0;
  const queries = { sourceFile: file, types: { typeArgumentBindings(type) {
    reads += 1;
    assert.equal(type === receiver, true, "capture uses the selected checked receiver");
    return bindings;
  } } };
  const source = formCsharpSourceTypeArguments(receiver, queries);
  queries.types.typeArgumentBindings = () => assert.fail("binding must consume retained checked rows");
  assert.equal(source.type === receiver && source.queries === queries && source.bindings === bindings, true,
    "source keeps the original type, query owner and ordered vector");
  const outer = {};
  const outerBinding = { sourceType: {}, targetType: integer };
  const originalBindings = new Map([[outer, outerBinding]]);
  const storage = {};
  const subject = {};
  const rejection = () => assert.fail("no rejection is manufactured");
  for (const depth of [3, 8]) {
    const state = { depth, sourceBindings: originalBindings, sourceStorageBindings: storage,
      sourceStorageSubject: subject, rejectNativeResolution: rejection };
    const input = bindCsharpSourceTypeArgumentsSource(source, state);
    assert.equal(input.source === source && input.state === state, true, "binding retains the actual source and state");
    const selected = resolveFormedCsharpSourceTypeArguments({ resolveTypeWithState(type, sourceFile, childState) {
      assert.equal(type === argumentType && sourceFile === file && childState.depth === depth + 1 &&
        childState.sourceBindings === originalBindings && childState.sourceStorageBindings === storage &&
        childState.sourceStorageSubject === subject && childState.rejectNativeResolution === rejection, true,
      "the original child state retains all current owner references");
      return integer;
    } }, input);
    assert.equal(selected?.sourceBindings?.get(declaration)?.sourceType === argumentType &&
      selected.sourceBindings.get(declaration)?.targetType === integer &&
      selected.sourceBindings.get(outer) === outerBinding, true, "only the selected declaration binding is added");
  }
  assert.equal(reads === 1 && originalBindings.size === 1, true, "one capture and no caller mutation");
});

test("synthetic receiver argument requests reject a sparse or foreign vector before any child", () => {
  const declaration = {};
  const binding = { declaration, argumentType: {} };
  const source = formCsharpSourceTypeArguments({}, { sourceFile: {}, types: { typeArgumentBindings: () => [binding] } });
  const input = bindCsharpSourceTypeArgumentsSource(source, { depth: 2 });
  let children = 0;
  const scope = { resolveTypeWithState: () => { children += 1; return undefined; } };
  for (const arguments_ of [new Array(1), [{ binding: { ...binding }, state: input.arguments[0].state }]]) {
    assert.throws(() => resolveFormedCsharpSourceTypeArguments(scope, { ...input, arguments: arguments_ }),
      /every exact checked argument in order/);
  }
  assert.throws(() => resolveFormedCsharpSourceTypeArguments(scope, { kind: "arguments", state: input.state,
    bindings: source.bindings, arguments: input.arguments }), /exact retained source input/);
  assert.equal(children, 0, "no invalid request reaches a native child");
});

test("synthetic receiver binding keeps all-child failure, duplicate rejection and unchanged-state identity", () => {
  const declaration = {};
  const other = {};
  const firstType = {};
  const secondType = {};
  const state = { depth: 4, sourceBindings: new Map() };
  const bindings = [{ declaration, argumentType: firstType }, { declaration: other, argumentType: secondType }];
  const source = formCsharpSourceTypeArguments({}, { sourceFile: {}, types: { typeArgumentBindings: () => bindings } });
  const children = [];
  const failed = resolveFormedCsharpSourceTypeArguments({ resolveTypeWithState(type) {
    children.push(type);
    return type === firstType ? undefined : { kind: "source-primitive", name: "int64" };
  } }, bindCsharpSourceTypeArgumentsSource(source, state));
  assert.equal(failed === undefined && children.length === 2 && children[0] === firstType && children[1] === secondType, true,
    "a missing earlier result does not skip the later original child");
  const duplicate = formCsharpSourceTypeArguments({}, { sourceFile: {}, types: {
    typeArgumentBindings: () => [bindings[0], { declaration, argumentType: secondType }],
  } });
  const rejected = resolveFormedCsharpSourceTypeArguments({ resolveTypeWithState: () => assert.fail("duplicates stop before children") },
    bindCsharpSourceTypeArgumentsSource(duplicate, state));
  assert.equal(rejected, undefined, "duplicate declarations retain their original rejection");
  const unchanged = formCsharpSourceTypeArguments({}, { sourceFile: {}, types: { typeArgumentBindings: () => undefined } });
  assert.equal(resolveFormedCsharpSourceTypeArguments({ resolveTypeWithState: () => assert.fail("no arguments have no child") },
    bindCsharpSourceTypeArgumentsSource(unchanged, state)) === state, true, "genuine absence returns the same state");
  assert.equal(state.sourceBindings.size, 0, "neither failure publishes a partial binding");
});

test("the real common call former retains receiver rows before the original native instantiation and binding order", () => {
  const file = {};
  const receiverType = {};
  const argumentType = {};
  const declaration = {};
  const selectedType = {};
  const carrier = Object.freeze({ kind: "source-primitive", name: "int32" });
  const source = { call: {}, sourceCallee: { expression: {} }, sourceReceiver: { expression: {}, type: receiverType } };
  const order = [];
  const queries = { sourceFile: file, types: { typeArgumentBindings(type) {
    assert.equal(type === receiverType, true, "the actual receiver is captured");
    order.push("capture");
    return [{ declaration, argumentType }];
  } } };
  const callableSource = { source, sourceFile: file, queries, checked: { declaration: undefined } };
  const host = { ast: { is: { IsNewExpression: () => true, IsThisTypeNode: () => false, IsClassDeclaration: () => false }, getSourceFile: () => undefined, kindName: () => "unit-non-this" },
    representations: { sourceCallableSource: (call, sourceFile) => {
      assert.equal(call === source && sourceFile === file, true, "the original selected call and file are retained");
      return callableSource;
    } }, navigation: { isProjectDeclaration: () => false } };
  const input = formCsharpSourceCallContractSource({ host }, source, file);
  queries.types.typeArgumentBindings = () => assert.fail("native selected-call completion must not query receiver bindings again");
  const state = { depth: 6, sourceBindings: new Map() };
  let instantiations = 0;
  const scope = { host, resolveSourceCallInstantiation(call, sourceFile, childState) {
    instantiations += 1;
    order.push("instantiation");
    assert.equal(call === source && sourceFile === file && childState.depth === state.depth + 1 &&
      childState.sourceBindings === state.sourceBindings, true, "the original instantiation state is unchanged");
    return { sourceArguments: [], arguments: [], substitutions: new Map() };
  }, resolveTypeWithState(type, sourceFile, childState) {
    order.push("binding");
    assert.equal(type === argumentType && sourceFile === file && childState.depth === state.depth + 1 &&
      childState.sourceBindings === state.sourceBindings, true, "binding uses the same entry state after instantiation");
    return carrier;
  }, resolveSourceCallReceiverTargetType: () => { order.push("receiver"); return undefined; },
  resolveAuthoredAndSelectedSourceType(node, authoredFile, type, selectedFile, boundState) {
    order.push("selected");
    assert.equal(node === undefined && authoredFile === file && type === selectedType && selectedFile === file &&
      boundState.sourceBindings.get(declaration)?.targetType === carrier, true, "the original selected child sees the completed binding");
    return carrier;
  } };
  assert.equal(resolveSourceCallSelectedType(scope, input, undefined, undefined, selectedType, state), carrier);
  assert.deepEqual(order, ["capture", "instantiation", "binding", "receiver", "selected"]);
  const foreign = { ...input, receiverTypeArguments: { ...input.receiverTypeArguments, type: {} } };
  assert.throws(() => resolveSourceCallSelectedType(scope, foreign, undefined, undefined, selectedType, state),
    /exact checked receiver arguments/);
  assert.throws(() => resolveSourceCallSelectedType(scope, source, undefined, undefined, selectedType, state),
    /exact retained contract source/);
  assert.equal(instantiations === 1 && state.sourceBindings.size === 0, true, "invalid packets stop before native work and the caller stays unchanged");
});
