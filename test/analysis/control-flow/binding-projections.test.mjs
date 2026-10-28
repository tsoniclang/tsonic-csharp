import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpBindingProjectionPolicy } from "../../../dist/analysis/control-flow/binding-projections.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

test("destructured contextual parameter bindings consume the actual native parameter owner without requiring an annotation", () => {
  const parameter = {};
  const pattern = {};
  const binding = {};
  const name = {};
  const sourceFile = {};
  const payload = csharpSourcePrimitiveTargetType("int64");
  const incoming = { kind: "tuple", elements: [payload] };
  let selections = 0;
  const policy = createCsharpBindingProjectionPolicy({
    ast: {
      is: {
        IsBindingElement: node => node === binding,
        IsVariableDeclaration: () => false,
        IsParameterDeclaration: node => node === parameter,
        IsObjectBindingPattern: () => false,
        IsArrayBindingPattern: node => node === pattern,
      },
      as: { AsBindingElement: node => node === binding ? { name } : undefined },
      parent: node => node === binding ? pattern : node === pattern ? parameter : undefined,
      getSourceFile: () => sourceFile,
      elements: node => node === pattern ? [binding] : [],
    },
    typeResolver: { resolveNode: (node, file) => {
      assert.equal(node === parameter, true, "the real selected parameter owns its contextual native tuple, not an absent authored type node");
      assert.equal(file === sourceFile, true, "native selection preserves the original source scope");
      selections += 1;
      return incoming;
    } },
  });
  const selected = policy.resolveProjection(binding, sourceFile, { depth: 0 });
  assert.equal(selected?.storageCarrier === payload, true, "the bound element retains its exact native int64 storage");
  assert.equal(selected?.bindingCarrier === payload, true, "contextual destructuring adds no scalar conversion or second representation");
  assert.equal(selections, 1, "the existing parameter authority is consumed once");
});
