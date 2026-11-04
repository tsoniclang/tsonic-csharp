import assert from "node:assert/strict";
import test from "node:test";
import { csharpSourceProfileInputs } from "../../../helpers/planning-records.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";

test("profile call property and index results are keyed by their exact operation occurrence even when checked Types coincide", () => {
  const sourceFile = {};
  const checkedType = {};
  const selectedDeclaration = {};
  const operations = [
    { kind: "call", node: {}, carrier: csharpSourcePrimitiveTargetType("int32") },
    { kind: "property", node: {}, carrier: csharpSourcePrimitiveTargetType("int64") },
    { kind: "index", node: {}, carrier: csharpSourcePrimitiveTargetType("float32") },
  ];
  const call = { call: operations[0].node, sourceResultType: checkedType, sourceSelectedSignatureKind: "resolved",
    sourceArguments: [], sourceArgumentBindings: [], sourceSelectedSignatureParameters: [] };
  const access = { sourceReadType: checkedType, selectedDeclaration };
  const reads = [];
  const host = { semantics: () => ({ sourceFile,
    types: { isNumberLike: () => false }, operations: {
      call: node => node === call.call ? call : undefined,
      propertyAccess: node => node === operations[1].node ? access : undefined,
      elementAccess: node => node === operations[2].node ? access : undefined,
    } }), types: {
    resolveType: () => assert.fail("a value result cannot be keyed by the checker's shared Type"),
    resolveSourceCallTypeArguments: () => [],
    resolveSourceCallResult(selected, file) {
      assert.equal(selected === call && file === sourceFile, true, "the retained selected call stays the result owner");
      reads.push(selected.call);
      return { nativeType: operations[0].carrier, selectedType: operations[0].carrier };
    },
    resolveSelectedResult(node, owner, type, file) {
      assert.equal(owner === selectedDeclaration && type === checkedType && file === sourceFile, true,
        "property and index reads keep the original declared relation without using its Type as a value key");
      const selected = operations.find(operation => operation.node === node);
      assert.equal(selected !== undefined && selected.kind !== "call", true, "only the exact checked access may query this owner");
      reads.push(node);
      return selected.carrier;
    },
  } };
  for (const operation of operations) {
    const inputs = csharpSourceProfileInputs(host, sourceFile, { operation: operation.node,
      ...(operation.kind === "call" ? { source: call } : {}) });
    assert.equal(inputs.results.get(operation.node) === operation.carrier, true, "the real input producer publishes the exact operation's Native result");
    for (const foreign of [checkedType, {}, ...operations.filter(row => row !== operation).map(row => row.node)]) {
      assert.equal(inputs.results.get(foreign) === undefined, true, "neither shared Type nor another operation can select this result");
    }
    assert.equal(Object.prototype.hasOwnProperty.call(inputs, "types"), false, "the old Type-keyed result channel is absent");
  }
  assert.equal(reads.length === 3 && reads.every((node, index) => node === operations[index].node), true,
    "each exact result owner is queried once in the original operation order");
});

test("Source-profile fixture packets reject the retired result-Type form instead of choosing an operation", () => {
  assert.throws(() => csharpSourceProfileInputs({}, {}, { result: {} }), /exact operation occurrence/u);
});
