import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpSelectedReceiverSource, completeCsharpSelectedReceiver } from "../../../dist/analysis/source-evidence/types/resolution/receiver-completions.js";
import { completeCsharpSourceCallableTypeSource } from "../../../dist/analysis/source-evidence/types/resolution/call-type-source.js";

function fixture() {
  const expression = {};
  const checkedType = {};
  const declaration = {};
  const receiver = { expression, type: checkedType };
  const queries = { sourceFile: {} };
  const declared = { declaration };
  const bindings = Object.freeze([{ kind: "type-parameter", identity: "unit:Item", name: "Item" }]);
  const owner = { declaration, typeParameterBindings: bindings };
  const target = { kind: "target-named", id: "unit:Owner", name: "Owner", typeArguments: bindings };
  const order = [];
  const catalog = {
    declarationContaining(node) {
      assert.equal(node === expression, true, "D selects the actual checked receiver occurrence");
      order.push("declared");
      return declared;
    },
    definitionForDeclaration(node) {
      assert.equal(node === declaration, true, "ABI consumes the same retained D declaration");
      order.push("definition");
      return owner;
    },
    targetTypeForDeclaration(node, arguments_) {
      assert.equal(node === declaration && arguments_ === bindings, true, "the full actual ABI vector is kept");
      order.push("target");
      return target;
    },
  };
  const host = { ast: { kindName: () => "KindThisKeyword" }, projectTypeCatalog: catalog,
    projectTypeABI: () => { order.push("abi"); return { catalog }; } };
  return { expression, checkedType, declaration, receiver, queries, declared, bindings, owner, target, order, catalog, host };
}

test("synthetic selected receiver keeps the exact D owner before Node and Type children then reads the actual ABI", () => {
  const unit = fixture();
  const source = formCsharpSelectedReceiverSource(unit.host, unit.receiver, unit.queries);
  assert.equal(source.receiver === unit.receiver && source.queries === unit.queries &&
    source.declaredThis?.owner === unit.declared && source.declaredThis.catalog === unit.catalog, true,
    "source retains the original receiver, query and one-catalog declaration selection");
  unit.catalog.declarationContaining = () => assert.fail("native completion must not repeat the Source ancestor query");
  const rejection = () => assert.fail("no rejection is manufactured");
  const state = { depth: 5, sourceBindings: new Map(), rejectNativeResolution: rejection };
  const input = { source, state };
  const completed = completeCsharpSelectedReceiver({ host: { projectTypeCatalog: unit.catalog, projectTypeABI: unit.host.projectTypeABI },
    resolveNodeWithState(node, file, childState) {
      unit.order.push("node");
      assert.equal(node === unit.expression && file === unit.queries.sourceFile && childState.depth === 6 &&
        childState.sourceBindings === state.sourceBindings && childState.rejectNativeResolution === rejection, true,
        "the original Node child keeps its actual state");
      return undefined;
    },
    resolveTypeWithState(type, file, childState) {
      unit.order.push("type");
      assert.equal(type === unit.checkedType && file === unit.queries.sourceFile && childState.depth === 6 &&
        childState.sourceBindings === state.sourceBindings, true, "the original Type child is unchanged");
      return undefined;
    },
  }, input);
  assert.equal(completed?.input === input && completed.kind === "declared-this" && completed.owner === unit.owner &&
    completed.type === unit.target, true, "the same Native driver retains its real owner and result receipt");
  assert.deepEqual(unit.order, ["declared", "node", "type", "abi", "definition", "target"]);
});

test("synthetic selected receiver preserves Node and Type winners and missing-owner ABI publication order", () => {
  for (const winner of ["node", "type"]) {
    const unit = fixture();
    const source = formCsharpSelectedReceiverSource(unit.host, unit.receiver, unit.queries);
    const selected = completeCsharpSelectedReceiver({ host: { projectTypeCatalog: unit.catalog,
      projectTypeABI: () => assert.fail("an earlier winner must not request ABI") },
      resolveNodeWithState: () => { unit.order.push("node"); return winner === "node" ? unit.target : undefined; },
      resolveTypeWithState: () => { unit.order.push("type"); return unit.target; },
    }, { source, state: { depth: 2 } });
    assert.equal(selected?.kind === (winner === "node" ? "expression" : "type") && selected.type === unit.target, true);
    assert.deepEqual(unit.order, winner === "node" ? ["declared", "node"] : ["declared", "node", "type"]);
  }
  const unit = fixture();
  unit.catalog.declarationContaining = () => undefined;
  const source = formCsharpSelectedReceiverSource(unit.host, unit.receiver, unit.queries);
  const failure = new Error("synthetic current ABI is not published");
  assert.throws(() => completeCsharpSelectedReceiver({ host: { projectTypeCatalog: unit.catalog,
    projectTypeABI: () => { throw failure; } }, resolveNodeWithState: () => undefined, resolveTypeWithState: () => undefined,
  }, { source, state: { depth: 0 } }), error => error === failure);
});

test("synthetic selected receiver rejects the retired raw input and a foreign D owner before children", () => {
  const unit = fixture();
  const source = formCsharpSelectedReceiverSource(unit.host, unit.receiver, unit.queries);
  let children = 0;
  const scope = { host: { projectTypeCatalog: {} }, resolveNodeWithState: () => { children += 1; return undefined; },
    resolveTypeWithState: () => { children += 1; return undefined; } };
  assert.throws(() => completeCsharpSelectedReceiver(scope, { receiver: unit.receiver, queries: unit.queries, state: { depth: 0 } }),
    /actual retained Source owner/);
  assert.throws(() => completeCsharpSelectedReceiver(scope, { source, state: { depth: 0 } }), /actual retained Source owner/);
  assert.equal(children, 0, "invalid Source input never enters a Native child");
});

test("the real callable generator transports the same selected receiver Source into its chosen child", () => {
  const unit = fixture();
  const receiverSource = formCsharpSelectedReceiverSource(unit.host, unit.receiver, unit.queries);
  const call = { call: {}, sourceReceiver: unit.receiver };
  const state = { depth: 3 };
  const type = { kind: "source-primitive", name: "int32" };
  const input = { source: call, sourceFile: unit.queries.sourceFile, callable: { nativeSignature: {} }, type, state,
    construction: undefined, excludedSourceArgumentIndexes: undefined, receiverSource };
  const completion = completeCsharpSourceCallableTypeSource(input);
  const first = completion.next();
  assert.equal(first.done === false && first.value.kind === "instantiation", true);
  const next = completion.next({ kind: "instantiation", request: first.value,
    instantiation: { arguments: [], sourceArguments: [], substitutions: new Map(), inference: undefined } });
  assert.equal(next.done === false && next.value.kind === "receiver" && next.value.receiverInput.receiverSource === receiverSource &&
    next.value.receiverInput.state === state, true, "chosen receiver keeps the actual Source and caller state");
  const last = completion.next({ kind: "receiver", request: next.value, completion: undefined });
  assert.equal(last.done === true && last.value?.input === input && last.value.type === type, true);
  assert.throws(() => completeCsharpSourceCallableTypeSource({ ...input, receiverSource: { ...receiverSource, receiver: {} } }).next(),
    /exact retained Source receiver/);
});
