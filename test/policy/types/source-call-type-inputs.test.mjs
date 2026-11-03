import assert from "node:assert/strict";
import test from "node:test";
import { completeCsharpSourceCallableTypeSource } from "../../../dist/analysis/source-evidence/types/resolution/call-type-source.js";
import { completeCsharpSourceCallReceiver, completeCsharpSourceCallableType } from "../../../dist/analysis/source-evidence/types/resolution/calls.js";
import { completeCsharpSelectedReceiver } from "../../../dist/analysis/source-evidence/types/resolution/receiver-completions.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const parameter = Object.freeze({ kind: "type-parameter", name: "Item", identity: "UNIT:Item" });

function fixture(owner = {}) {
  const sourceFile = {};
  const receiver = Object.freeze({ expression: {}, type: {} });
  const source = Object.freeze({ call: {}, sourceCallee: { expression: {} }, sourceReceiver: receiver });
  const callable = Object.freeze({ nativeSignature: { methodTypeParameterIdentities: [parameter.identity], receiverTypeOwner: owner } });
  const state = Object.freeze({ depth: 2 });
  const excluded = new Set([1]);
  const input = Object.freeze({ source, callable, type: parameter, sourceFile, state, excludedSourceArgumentIndexes: excluded });
  const inference = Object.freeze({ source, callable, excludedSourceArgumentIndexes: excluded, bindings: new Map() });
  const instantiation = Object.freeze({ arguments: [integer], substitutions: new Map([[parameter.identity, integer]]),
    sourceArguments: [], inference });
  const receiverType = Object.freeze({ kind: "target-named", id: "UNIT.Owner" });
  const queries = Object.freeze({ sourceFile });
  const scope = { host: { ast: { kindName: () => "KindIdentifier", is: { IsNewExpression: () => false } },
    semantics: file => {
      assert.equal(file === sourceFile, true);
      return queries;
    } }, completeSelectedReceiver: selected => completeCsharpSelectedReceiver({
      resolveNodeWithState: () => receiverType,
      resolveTypeWithState: () => assert.fail("UNIT unused receiver Type child"),
    }, selected) };
  return { input, inference, instantiation, receiverType, queries, scope };
}

test("UNIT callable type exposes the same inference and receiver before its declaration child", () => {
  const current = fixture();
  const completion = completeCsharpSourceCallableTypeSource(current.input);
  const instantiation = completion.next();
  assert.equal(!instantiation.done && instantiation.value.kind === "instantiation" &&
    instantiation.value.input === current.input && instantiation.value.state !== current.input.state && instantiation.value.state.depth === 3, true);
  const receiver = completion.next({ kind: "instantiation", request: instantiation.value, instantiation: current.instantiation });
  assert.equal(!receiver.done && receiver.value.kind === "receiver" && receiver.value.instantiation === current.instantiation &&
    receiver.value.instantiation.inference === current.inference && receiver.value.substituted === integer &&
    receiver.value.receiverInput.source === current.input.source && receiver.value.receiverInput.state === current.input.state, true);
  const actualReceiver = completeCsharpSourceCallReceiver(current.scope, receiver.value.receiverInput);
  const declaration = completion.next({ kind: "receiver", request: receiver.value, completion: actualReceiver });
  assert.equal(!declaration.done && declaration.value.kind === "declaration" && declaration.value.instantiation === current.instantiation &&
    declaration.value.receiverType === actualReceiver.type && actualReceiver.kind === "selected" &&
    actualReceiver.selected.kind === "expression" && actualReceiver.selected.input.receiver === current.input.source.sourceReceiver, true);
  const result = { kind: "resolved", type: integer };
  const completed = completion.next({ kind: "declaration", request: declaration.value, result });
  assert.equal(completed.done && completed.value?.input === current.input && completed.value.instantiation === current.instantiation &&
    completed.value.receiver === actualReceiver && completed.value.receiverInstantiation === result &&
    completed.value.shape === undefined && completed.value.type === integer, true);
});

test("UNIT callable type retains missing and rejected short circuits and the original receiver template", () => {
  const current = fixture();
  const missing = completeCsharpSourceCallableTypeSource(current.input);
  const missingRequest = missing.next().value;
  const absent = missing.next({ kind: "instantiation", request: missingRequest, instantiation: undefined });
  assert.equal(absent.done && absent.value === undefined, true);
  const rejected = completeCsharpSourceCallableTypeSource(current.input);
  const instantiation = rejected.next().value;
  const receiver = rejected.next({ kind: "instantiation", request: instantiation, instantiation: current.instantiation }).value;
  const declaration = rejected.next({ kind: "receiver", request: receiver, completion: undefined }).value;
  const unresolved = rejected.next({ kind: "declaration", request: declaration, result: { kind: "unresolved" } });
  assert.equal(unresolved.done && unresolved.value === undefined, true);
  const input = { ...current.input, callable: { nativeSignature: { methodTypeParameterIdentities: [] } } };
  const template = { kind: "target-named", id: "UNIT.Owner", typeArguments: [parameter] };
  const target = { kind: "target-named", id: "UNIT.Owner", typeArguments: [integer] };
  const empty = { arguments: [], substitutions: new Map(), sourceArguments: [], inference: undefined };
  const projected = completeCsharpSourceCallableTypeSource(input);
  const first = projected.next().value;
  const selected = projected.next({ kind: "instantiation", request: first, instantiation: empty }).value;
  const shapeRequest = projected.next({ kind: "receiver", request: selected,
    completion: { input: selected.receiverInput, type: target } }).value;
  assert.equal(shapeRequest.kind === "shape" && shapeRequest.receiverType === target && shapeRequest.substituted === parameter, true);
  const shape = { declarationTemplate: { targetType: template } };
  const result = projected.next({ kind: "shape", request: shapeRequest, shape });
  assert.equal(result.done && result.value?.shape === shape && result.value.receiverBindings.get(parameter.identity) === integer &&
    result.value.type === integer, true);
});

test("UNIT callable type children require exact operation, request and retained receiver input", () => {
  const current = fixture();
  const foreign = completeCsharpSourceCallableTypeSource(current.input);
  const request = foreign.next().value;
  assert.throws(() => foreign.next({ kind: "instantiation", request: { ...request }, instantiation: current.instantiation }), /exact instantiation dependency/);
  const wrongKind = completeCsharpSourceCallableTypeSource(current.input);
  const original = wrongKind.next().value;
  assert.throws(() => wrongKind.next({ kind: "receiver", request: original, completion: undefined }), /exact instantiation dependency/);
  const wrongReceiver = completeCsharpSourceCallableTypeSource(current.input);
  const first = wrongReceiver.next().value;
  const receiver = wrongReceiver.next({ kind: "instantiation", request: first, instantiation: current.instantiation }).value;
  assert.throws(() => wrongReceiver.next({ kind: "receiver", request: receiver,
    completion: { input: { ...receiver.receiverInput }, type: current.receiverType } }), /exact retained receiver input/);
});

test("UNIT native callable driver delegates once and selected receivers keep Node Type declared-this priority", () => {
  const current = fixture();
  const visits = [];
  const completed = completeCsharpSourceCallableType({
    resolveSourceCallInstantiation: (source, file, state, identities, callable, excluded) => {
      assert.equal(source === current.input.source && file === current.input.sourceFile && state.depth === 3 &&
        identities === current.input.callable.nativeSignature.methodTypeParameterIdentities && callable === current.input.callable &&
        excluded === current.input.excludedSourceArgumentIndexes, true);
      visits.push("instantiation");
      return current.instantiation;
    }, completeSourceCallReceiver: input => {
      visits.push("receiver");
      return completeCsharpSourceCallReceiver(current.scope, input);
    }, host: { projectTypes: () => ({ instantiateDeclarationType: () => {
      visits.push("declaration");
      return { kind: "resolved", type: integer };
    } }), structuralTypes: { resolveTarget: () => assert.fail("UNIT declaration completion must skip shape fallback") } },
  }, current.input);
  assert.equal(visits.join(",") === "instantiation,receiver,declaration" && completed?.type === integer && completed.instantiation === current.instantiation, true);
  for (const mode of ["expression", "type", "declared-this"]) {
    const queries = { sourceFile: {} };
    const input = { receiver: { expression: {}, type: {} }, queries, state: { depth: 4 } };
    const order = [];
    const states = [];
    const owner = { declaration: {}, typeParameterBindings: [] };
    const selected = completeCsharpSelectedReceiver({
      resolveNodeWithState: (node, file, state) => {
        order.push("expression"); states.push(state);
        return mode === "expression" ? integer : undefined;
      }, resolveTypeWithState: (type, file, state) => {
        order.push("type"); states.push(state);
        return mode === "type" ? integer : undefined;
      }, host: { ast: { kindName: () => "KindThisKeyword" }, projectTypeCatalog: {
        definitionContainingDeclaration: () => { order.push("declared-this"); return owner; },
        targetTypeForDeclaration: () => integer,
      } },
    }, input);
    assert.equal(selected?.input === input && selected.kind === mode && selected.type === integer &&
      order.join(",") === (mode === "expression" ? "expression" : mode === "type" ? "expression,type" : "expression,type,declared-this"), true, mode);
    assert.equal(states.every(state => state.depth === 5) && (states.length === 1 || states[0] !== states[1]) &&
      (mode === "declared-this" ? selected.owner === owner : selected.childState === states.at(-1)), true, mode);
  }
});
