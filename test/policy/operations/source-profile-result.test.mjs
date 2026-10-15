import assert from "node:assert/strict";
import test from "node:test";
import { resolveCsharpSourceProfileGenericResult } from "../../../dist/policy/operations/source-profiles/source-profile-result.js";
import { csharpSourcePrimitiveTargetType, csharpTaskTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("generic source-profile results preserve selected native marker width and syntax provenance", () => {
  const explicitTypeNode = {};
  const selectedType = {};
  const sourceFile = {};
  const exact = csharpSourcePrimitiveTargetType("uint64");
  const context = { sourceFile, source: { sourceSelectedMethodTypeArguments: [{ explicitTypeNode, selectedType }] },
    host: { types: { resolveType: () => assert.fail("Selected generic evidence cannot use semantic-only resolution."),
      resolveSelectedType: (node, type, file) => {
        assert.equal(node === explicitTypeNode && type === selectedType && file === sourceFile, true);
        return exact;
      } } } };
  const selected = resolveCsharpSourceProfileGenericResult(context, 1, arguments_ => {
    assert.equal(Object.isFrozen(arguments_), true);
    return csharpTaskTargetType(arguments_[0]);
  });
  assert.equal(targetTypeRefEquals(selected, csharpTaskTargetType(exact)), true);
});

test("generic source-profile result inference uses the existing result owner and rejects incomplete selections", () => {
  const sourceResultType = {};
  const sourceFile = {};
  const inferred = csharpTaskTargetType(csharpSourcePrimitiveTargetType("int32"));
  const context = { sourceFile, source: { sourceResultType }, host: { types: {
    resolveType: (type, file) => {
      assert.equal(type === sourceResultType && file === sourceFile, true);
      return inferred;
    }, resolveSelectedType: () => undefined,
  } } };
  assert.equal(resolveCsharpSourceProfileGenericResult(context, 1, () => assert.fail("Inferred carrier is already constructed.")) === inferred, true);
  for (const selected of [[{ selectedType: {} }], [{ selectedType: {} }, { selectedType: {} }]]) {
    assert.equal(resolveCsharpSourceProfileGenericResult({ ...context, source: { ...context.source, sourceSelectedMethodTypeArguments: selected } },
      1, () => assert.fail("Incomplete or wrong-arity selections cannot construct a carrier.")), undefined);
  }
});
