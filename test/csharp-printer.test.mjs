import { test } from "node:test";
import assert from "node:assert/strict";
import { csharpTypeFromTargetTypeRef } from "../dist/backend/planner/target-types.js";
import { renderObjectShapeMembers } from "../dist/backend/planner/object-shape-declarations.js";
import { printCsharpType } from "../dist/print/csharp-printer.js";
import {
  csharpDelegateTargetType,
  csharpTargetTypeFromBinding,
} from "../dist/source/csharp-source-semantics/target-types.js";

test("printer preserves C# array rank", () => {
  assert.equal(printCsharpType({ kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } }), "int[]");
  assert.equal(printCsharpType({ kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" }, rank: 2 }), "int[,]");
  assert.equal(printCsharpType({ kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" }, rank: 3 }), "int[,,]");
});

test("printer renders pointer and function-pointer type nodes", () => {
  assert.equal(printCsharpType({ kind: "PointerType", pointee: { kind: "PredefinedType", name: "int" } }), "int*");
  assert.equal(
    printCsharpType({
      kind: "FunctionPointerType",
      parameters: [{ kind: "PredefinedType", name: "int" }],
      returnType: { kind: "PredefinedType", name: "int" },
    }),
    "delegate*<int, int>",
  );
});

test("target type rendering requires explicit C# render shape for non-predefined target IDs", () => {
  assert.equal(
    csharpTypeFromTargetTypeRef({
      kind: "target-named",
      id: "System.Collections.Generic.List`1",
      typeArguments: [{ kind: "target-named", id: "System.Int32" }],
    }),
    undefined,
  );

  const rendered = csharpTypeFromTargetTypeRef({
    kind: "target-named",
    id: "System.Collections.Generic.List`1",
    csharpRender: {
      kind: "named",
      namespace: ["System", "Collections", "Generic"],
      name: "List",
    },
    typeArguments: [{ kind: "target-named", id: "System.Int32" }],
  });

  assert.ok(rendered);
  assert.equal(printCsharpType(rendered), "System.Collections.Generic.List<int>");
});

test("target bindings do not infer C# render shape from targetName or id", () => {
  assert.equal(csharpTargetTypeFromBinding({
    id: "Example.Widget",
    sourceName: "Widget",
    targetName: "Example.Widget",
    target: "csharp",
    kind: "class",
  }), undefined);

  assert.deepEqual(csharpTargetTypeFromBinding({
    id: "Example.Widget",
    sourceName: "Widget",
    targetName: "Example.Widget",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Widget" },
  }), {
    kind: "target-named",
    id: "Example.Widget",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Widget" },
  });
});

test("object shape methods require explicit delegate signature metadata", () => {
  const rawDelegateShape = {
    targetType: { kind: "target-named", id: "__Shape" },
    members: [{
      sourceName: "visit",
      targetName: "Visit",
      memberKind: "method",
      type: {
        kind: "target-named",
        id: "System.Action`1",
        csharpRender: { kind: "named", namespace: ["System"], name: "Action" },
        typeArguments: [{ kind: "source-primitive", name: "int32" }],
      },
    }],
  };
  assert.equal(renderObjectShapeMembers(rawDelegateShape, false, undefined, undefined), undefined);

  const metadataBackedShape = {
    ...rawDelegateShape,
    members: [{
      ...rawDelegateShape.members[0],
      type: csharpDelegateTargetType("System.Action", [{ kind: "source-primitive", name: "int32" }]),
    }],
  };
  const members = renderObjectShapeMembers(metadataBackedShape, false, undefined, undefined);
  assert.ok(members);
  assert.equal(members.length, 2);
  assert.equal(members[1].kind, "MethodDeclaration");
  assert.equal(members[1].parameters[0].name, "arg0");
  assert.deepEqual(members[1].parameters[0].type, { kind: "PredefinedType", name: "int" });
});
