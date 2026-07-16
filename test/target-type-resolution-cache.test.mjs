import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTargetTypeRefForType,
} from "../dist/source/csharp-source-semantics/target-type-resolution.js";

test("one recursive target-type transaction resolves each completed semantic type once", () => {
  const rootType = { flags: 1 };
  const stringType = { flags: 2 };
  let stringClassifications = 0;
  const context = {
    compiler: {
      checker: {
        getSymbolDeclarations: () => [],
        getTypeSymbol: () => undefined,
      },
      typeShape: {
        getCallSignatures: () => [],
        getUnionOrIntersectionTypes: () => [],
        isAny: () => false,
        isArrayLike: () => false,
        isBigIntLike: () => false,
        isBooleanLike: () => false,
        isNullish: () => false,
        isNumberLike: () => false,
        isStringLike: (type) => {
          if (type === stringType) {
            stringClassifications += 1;
            return true;
          }
          return false;
        },
        isTuple: () => false,
        isTypeReference: () => false,
        isUnion: () => false,
        isVoidLike: () => false,
      },
    },
    factResolver: {
      resolve: () => undefined,
    },
  };
  const rootTarget = { kind: "target-named", id: "Test.Root" };
  const host = {
    getAssignableTargetTypeRefs: () => [],
    getBaseTargetTypeRef: () => undefined,
    getCatchVariableTargetTypeRef: () => undefined,
    getCsharpObjectShapeFactForSubject: () => undefined,
    getCsharpTargetBindingByMetadataName: () => undefined,
    getCsharpTargetBindingByTargetId: () => undefined,
    getNumericLiteralTargetTypeRef: () => undefined,
    getSemanticTypeDeclarationShape: (type, targetContext, resolver) => {
      if (type !== rootType || resolver === undefined) {
        return undefined;
      }
      assert.deepEqual(resolver.resolveType(stringType, targetContext, {}, host), {
        kind: "target-named",
        id: "System.String",
        csharpRender: { kind: "predefined", name: "string" },
        csharpSpecialType: "string",
        csharpTypeofRuntimeKind: "string",
      });
      assert.deepEqual(resolver.resolveType(stringType, targetContext, {}, host), {
        kind: "target-named",
        id: "System.String",
        csharpRender: { kind: "predefined", name: "string" },
        csharpSpecialType: "string",
        csharpTypeofRuntimeKind: "string",
      });
      return { kind: "class", targetType: rootTarget };
    },
  };

  assert.equal(resolveTargetTypeRefForType(rootType, context, {}, host), rootTarget);
  assert.equal(stringClassifications, 1);
});
