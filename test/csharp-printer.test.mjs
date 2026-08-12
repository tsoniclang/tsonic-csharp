import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csharpTypeFromTargetTypeRef,
} from "../dist/backend/planner/target-types.js";
import { renderObjectShapeMembers } from "../dist/backend/planner/object-shape-declarations.js";
import {
  printCsharpCompilationUnit,
  printCsharpExpression,
  printCsharpStatement,
  printCsharpType,
} from "../dist/print/csharp-printer.js";
import {
  csharpDelegateTargetType,
  csharpTargetTypeFromBinding,
  targetTypeRefEquals,
} from "../dist/policy/types/index.js";

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

test("printer renders cast expression nodes", () => {
  assert.equal(
    printCsharpExpression({
      kind: "CastExpression",
      type: { kind: "IdentifierName", name: "Animal" },
      expression: { kind: "IdentifierName", name: "value" },
    }),
    "(Animal)value",
  );
});

test("printer preserves exact 64-bit integer literal digits", () => {
  assert.equal(
    printCsharpExpression({
      kind: "IntegerLiteralExpression",
      digits: "18446744073709551615",
      suffix: "UL",
    }),
    "18446744073709551615UL",
  );
  assert.throws(
    () => printCsharpExpression({
      kind: "IntegerLiteralExpression",
      digits: "1; Console.WriteLine(2)",
      suffix: "L",
    }),
    /integer literal digits must be canonical unsigned decimal text/u,
  );
});

test("printer renders explicit unsafe statement and expression nodes", () => {
  assert.equal(
    printCsharpStatement({
      kind: "UnsafeStatement",
      body: {
        kind: "Block",
        statements: [{
          kind: "ReturnStatement",
          expression: {
            kind: "PrefixUnaryExpression",
            operatorToken: { kind: "AsteriskToken" },
            operand: { kind: "IdentifierName", name: "pointer" },
          },
        }],
      },
    }),
    "unsafe\n{\n    return *pointer;\n}",
  );
  assert.equal(
    printCsharpExpression({
      kind: "UnsafeExpression",
      expression: {
        kind: "PrefixUnaryExpression",
        operatorToken: { kind: "AsteriskToken" },
        operand: { kind: "IdentifierName", name: "pointer" },
      },
    }),
    "unsafe(*pointer)",
  );
});

test("printer keeps declaration and accessor safety controls independent", () => {
  assert.equal(
    printCsharpCompilationUnit({
      kind: "CompilationUnit",
      usings: [],
      members: [{
        kind: "ClassDeclaration",
        name: "NativeApi",
        modifiers: ["public"],
        members: [{
          kind: "MethodDeclaration",
          name: "Read",
          modifiers: ["public", "unsafe"],
          returnType: { kind: "PredefinedType", name: "int" },
          parameters: [],
          body: { kind: "Block", statements: [] },
        }, {
          kind: "PropertyDeclaration",
          name: "Value",
          modifiers: ["public"],
          type: { kind: "PredefinedType", name: "int" },
          getter: { kind: "Block", statements: [] },
          getterModifiers: ["safe"],
          setter: { kind: "Block", statements: [] },
          setterModifiers: ["unsafe"],
        }],
      }],
    }),
    `public class NativeApi
{
    public unsafe int Read()
    {
    }
    public int Value
    {
        safe get
        {
        }
        unsafe set
        {
        }
    }
}
`,
  );
});

test("printer preserves a cast as the receiver of every postfix operation", () => {
  const cast = {
    kind: "CastExpression",
    type: { kind: "IdentifierName", name: "Derived" },
    expression: { kind: "IdentifierName", name: "value" },
  };
  assert.equal(
    printCsharpExpression({
      kind: "SimpleMemberAccessExpression",
      receiver: cast,
      name: "score",
    }),
    "((Derived)value).score",
  );
  assert.equal(
    printCsharpExpression({
      kind: "ElementAccessExpression",
      receiver: cast,
      argument: { kind: "LiteralExpression", value: 0 },
    }),
    "((Derived)value)[0]",
  );
  assert.equal(
    printCsharpExpression({
      kind: "InvocationExpression",
      callee: cast,
      arguments: [],
    }),
    "((Derived)value)()",
  );
});

test("printer parenthesizes casted lambda expressions", () => {
  assert.equal(
    printCsharpExpression({
      kind: "CastExpression",
      type: {
        kind: "QualifiedName",
        left: { kind: "IdentifierName", name: "System" },
        name: "Func",
        typeArguments: [{ kind: "PredefinedType", name: "int" }],
      },
      expression: {
        kind: "LambdaExpression",
        parameters: [],
        body: {
          kind: "Block",
          statements: [{ kind: "ReturnStatement", expression: { kind: "LiteralExpression", value: 1 } }],
        },
      },
    }),
    "(System.Func<int>)(() =>\n{\n    return 1;\n})",
  );
});

test("printer renders generic member invocation from Roslyn AST nodes", () => {
  assert.equal(
    printCsharpExpression({
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "Helpers" },
        name: "apply",
        typeArguments: [
          { kind: "PredefinedType", name: "int" },
          { kind: "PredefinedType", name: "string" },
        ],
      },
      arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name: "value" } }],
    }),
    "Helpers.apply<int, string>(value)",
  );
});

test("printer parenthesizes conditional expressions inside interpolation holes", () => {
  assert.equal(
    printCsharpExpression({
      kind: "InterpolatedStringExpression",
      parts: [
        { kind: "InterpolatedStringText", text: "value:" },
        {
          kind: "Interpolation",
          expression: {
            kind: "ConditionalExpression",
            condition: { kind: "IdentifierName", name: "ok" },
            whenTrue: { kind: "LiteralExpression", value: "yes" },
            whenFalse: { kind: "LiteralExpression", value: "no" },
          },
        },
      ],
    }),
    '$"value:{(ok ? "yes" : "no")}"',
  );
});

test("printer fails closed for invalid or foreign raw syntax nodes", () => {
  assert.throws(
    () => printCsharpExpression({ kind: "RawExpression", code: "Console.WriteLine(1)" }),
    /Unsupported C# expression syntax reached printer: RawExpression/,
  );
  assert.throws(
    () => printCsharpStatement({ kind: "RawStatement", code: "Console.WriteLine(1);" }),
    /Unsupported C# statement syntax reached printer: RawStatement/,
  );
  assert.throws(
    () => printCsharpType({ kind: "RawType", text: "dynamic" }),
    /Unsupported C# type syntax reached printer: RawType/,
  );
  assert.throws(
    () => printCsharpType({ kind: "InvalidType", reason: "missing fact" }),
    /Invalid C# type reached printer: missing fact/,
  );
  assert.throws(
    () => printCsharpCompilationUnit({
      kind: "CompilationUnit",
      usings: [],
      members: [{ kind: "RawMember", code: "class C {}" }],
    }),
    /Unsupported C# compilation-unit member syntax reached printer: RawMember/,
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
    typeArguments: [{ kind: "source-primitive", name: "int32" }],
  });

  assert.ok(rendered);
  assert.equal(printCsharpType(rendered), "System.Collections.Generic.List<int>");
});

test("source-global target refs remain source evidence until wrapped by a C# target carrier", () => {
  const promiseOfString = {
    kind: "source-global",
    name: "Promise",
    typeArguments: [{ kind: "target-named", id: "System.String" }],
  };
  const promiseOfNumber = {
    kind: "source-global",
    name: "Promise",
    typeArguments: [{ kind: "target-named", id: "System.Double" }],
  };

  assert.equal(csharpTypeFromTargetTypeRef(promiseOfString), undefined);
  assert.equal(targetTypeRefEquals(promiseOfString, { ...promiseOfString }), true);
  assert.equal(targetTypeRefEquals(promiseOfString, promiseOfNumber), false);

  const rendered = csharpTypeFromTargetTypeRef({
    kind: "target-named",
    id: "System.Threading.Tasks.Task`1",
    typeArguments: [{ kind: "source-primitive", name: "int32" }],
    csharpRender: {
      kind: "named",
      namespace: ["System", "Threading", "Tasks"],
      name: "Task",
    },
  });
  assert.ok(rendered);
  assert.equal(printCsharpType(rendered), "System.Threading.Tasks.Task<int>");
});

test("target bindings require explicit C# render shape", () => {
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
  assert.deepEqual(members[0].modifiers, ["public", "required"]);
  assert.equal(members[1].kind, "MethodDeclaration");
  assert.equal(members[1].parameters[0].name, "arg0");
  assert.deepEqual(members[1].parameters[0].type, { kind: "PredefinedType", name: "int" });
  assert.deepEqual(members[1].returnType, { kind: "PredefinedType", name: "void" });
  assert.equal(members[1].body.statements[0].kind, "ExpressionStatement");

  const missingReturnFactShape = {
    ...rawDelegateShape,
    members: [{
      ...rawDelegateShape.members[0],
      type: {
        ...rawDelegateShape.members[0].type,
        csharpDelegateSignature: {
          parameters: [{ kind: "source-primitive", name: "int32" }],
        },
      },
    }],
  };
  const diagnostics = [];
  assert.equal(renderObjectShapeMembers(missingReturnFactShape, false, diagnostics, { Kind: "KindTypeLiteral" }), undefined);
  assert.match(diagnostics[0].message, /explicit return facts/);
});

test("object shape declarations enforce required members while leaving optional members optional", () => {
  const shape = {
    targetType: { kind: "target-named", id: "__Shape" },
    members: [{
      sourceName: "requiredValue",
      targetName: "requiredValue",
      memberKind: "property",
      type: { kind: "target-named", id: "System.String", csharpRender: { kind: "predefined", name: "string" } },
    }, {
      sourceName: "optionalValue",
      targetName: "optionalValue",
      memberKind: "property",
      type: {
        kind: "target-named",
        id: "System.String",
        csharpRender: { kind: "predefined", name: "string" },
        csharpNullableReference: true,
      },
      optional: true,
    }],
  };

  const fields = renderObjectShapeMembers(shape, false, undefined, undefined);
  assert.deepEqual(Object.fromEntries(fields?.map((member) => [member.name, member.modifiers]) ?? []), {
    optionalValue: ["public"],
    requiredValue: ["public", "required"],
  });
  const properties = renderObjectShapeMembers(shape, true, undefined, undefined);
  assert.deepEqual(Object.fromEntries(properties?.map((member) => [member.name, member.modifiers]) ?? []), {
    optionalValue: ["public"],
    requiredValue: ["public", "required"],
  });
});
