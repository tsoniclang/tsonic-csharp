import type { CsharpPlanningContext } from "../context.js";
import type {
  CsharpExpression,
  CsharpMethodDeclaration,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import type {
  CsharpObjectShapeFact,
} from "../../../target-model/types/index.js";
import {
  resolveCsharpJsonObjectShapeContract,
} from "../../../target-model/types/index.js";
import {
  objectShapeStorageMemberName,
} from "./object-shape-storage.js";
import {
  qualifiedCsharpType,
} from "../types/index.js";

export const csharpJsonValueWriterMethodName = "__tsonicWriteJson";
export const csharpJsonValueProjectionMethodName = "__tsonicJsonValue";

export function objectShapeRequiresJsonSerialization(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
): boolean {
  return input.artifacts.objectShapeHasCapability(
    fact,
    "json-serialization",
  );
}

export function csharpJsonValueInterfaceType(): CsharpTypeNode {
  return qualifiedCsharpType("Tsonic.CSharp.Js", "IJsonValue");
}

export function renderJsonSerializableObjectShapeMethod(
  fact: CsharpObjectShapeFact,
): readonly CsharpMethodDeclaration[] {
  const writer = { kind: "IdentifierName", name: "writer" } as const;
  const context = { kind: "IdentifierName", name: "context" } as const;
  const key = { kind: "IdentifierName", name: "key" } as const;
  const contract = resolveCsharpJsonObjectShapeContract(fact);
  if (contract.kind === "rejected") {
    throw new Error(contract.reason);
  }
  const projected = contract.contract.kind === "to-json"
    ? invokeMember(
        { kind: "IdentifierName", name: "this" },
        contract.contract.member.targetName,
        contract.contract.passesPropertyKey ? [key] : [],
      )
    : createJsonObjectProjection(fact);
  const projectionMethod: CsharpMethodDeclaration = {
    kind: "MethodDeclaration",
    name: csharpJsonValueProjectionMethodName,
    modifiers: ["public"],
    returnType: {
      kind: "NullableType",
      inner: { kind: "PredefinedType", name: "object" },
    },
    parameters: [{ name: "key", type: { kind: "PredefinedType", name: "string" } }],
    body: {
      kind: "Block",
      statements: [{ kind: "ReturnStatement", expression: projected }],
    },
  };
  if (contract.contract.kind === "to-json") {
    return [
      projectionMethod,
      {
        kind: "MethodDeclaration",
        name: csharpJsonValueWriterMethodName,
        modifiers: ["public"],
        returnType: { kind: "PredefinedType", name: "void" },
        parameters: [
          { name: "writer", type: qualifiedCsharpType("System.Text.Json", "Utf8JsonWriter") },
          { name: "context", type: qualifiedCsharpType("Tsonic.CSharp.Js", "JsonWriteContext") },
          { name: "key", type: { kind: "PredefinedType", name: "string" } },
        ],
        body: {
          kind: "Block",
          statements: [expressionStatement({
            kind: "InvocationExpression",
            callee: {
              kind: "SimpleMemberAccessExpression",
              receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "JSON"),
              name: "writeValue",
            },
            arguments: [writer, projected, context, key]
              .map((expression) => ({ kind: "Argument" as const, expression })),
          })],
        },
      },
    ];
  }
  const statements: CsharpStatement[] = [
    expressionStatement(invokeMember(writer, "WriteStartObject")),
  ];
  for (const member of fact.members) {
    if (member.memberKind === "method" || member.sourceKey.kind !== "property") {
      continue;
    }
    statements.push(
      expressionStatement({
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "JSON"),
          name: "writeProperty",
        },
        arguments: [
          writer,
          { kind: "LiteralExpression" as const, value: member.sourceName },
          { kind: "IdentifierName" as const, name: objectShapeStorageMemberName(fact, member) },
          context,
        ]
          .map((expression) => ({ kind: "Argument" as const, expression })),
      }),
    );
  }
  statements.push(expressionStatement(invokeMember(writer, "WriteEndObject")));
  return [
    projectionMethod,
    {
      kind: "MethodDeclaration",
      name: csharpJsonValueWriterMethodName,
      modifiers: ["public"],
      returnType: { kind: "PredefinedType", name: "void" },
      parameters: [
        { name: "writer", type: qualifiedCsharpType("System.Text.Json", "Utf8JsonWriter") },
        { name: "context", type: qualifiedCsharpType("Tsonic.CSharp.Js", "JsonWriteContext") },
        { name: "key", type: { kind: "PredefinedType", name: "string" } },
      ],
      body: { kind: "Block", statements },
    },
  ];
}

function createJsonObjectProjection(fact: CsharpObjectShapeFact): CsharpExpression {
  const values: CsharpExpression[] = [];
  for (const member of fact.members) {
    if (member.memberKind === "method" || member.sourceKey.kind !== "property") {
      continue;
    }
    values.push(
      { kind: "LiteralExpression", value: member.sourceName },
      { kind: "IdentifierName", name: objectShapeStorageMemberName(fact, member) },
    );
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "JSON"),
      name: "createObject",
    },
    arguments: values.map((expression) => ({ kind: "Argument", expression })),
  };
}

function invokeMember(
  receiver: CsharpExpression,
  name: string,
  arguments_: readonly CsharpExpression[] = [],
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver, name },
    arguments: arguments_.map((expression) => ({ kind: "Argument", expression })),
  };
}

function expressionStatement(expression: CsharpExpression) {
  return { kind: "ExpressionStatement" as const, expression };
}
