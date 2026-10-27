import type { CsharpPlanningContext } from "../context.js";
import type {
  CsharpExpression,
  CsharpMethodDeclaration,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import type {
  CsharpObjectShapeFact,
} from "../../../target-model/types/index.js";
import type { CsharpJsonObjectShapeContract, CsharpJsonObjectShapeRecords } from "../../../target-model/records/objects/json-object-shapes.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import {
  csharpJsonValueWriterMethodName,
  csharpJsonValueProjectionMethodName,
} from "../../../target-model/names/object-members.js";
import {
  qualifiedCsharpType,
} from "../types/index.js";
import type { CsharpNativeMemberHidingReader } from "../../../target-model/records/native/native-member-names.js";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";

export function objectShapeRequiresJsonSerialization(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
): boolean {
  return input.program.records.jsonObjectShape.get(fact) !== undefined;
}

export function csharpJsonValueInterfaceType(): CsharpTypeNode {
  return qualifiedCsharpType("Tsonic.CSharp.Js", "IJsonValue");
}

export function renderJsonSerializableObjectShapeMethod(
  fact: CsharpObjectShapeFact,
  records: CsharpJsonObjectShapeRecords & { readonly nativeMemberHiding: CsharpNativeMemberHidingReader },
): readonly CsharpMethodDeclaration[] {
  const writer = { kind: "IdentifierName", name: "writer" } as const;
  const context = { kind: "IdentifierName", name: "context" } as const;
  const key = { kind: "IdentifierName", name: "key" } as const;
  const contract = records.jsonObjectShape.get(fact);
  if (contract === undefined) failCsharpPlannerInvariant("An admitted JSON object requires its sealed native contract.", fact.methodImplementation?.declaration);
  const names = records.nativeMemberHiding;
  const projected = contract.kind === "to-json"
    ? invokeMember(
        { kind: "IdentifierName", name: "this" },
        contract.member.targetName,
        contract.passesPropertyKey ? [key] : [],
      )
    : createJsonObjectProjection(contract.properties);
  const projectionMethod: CsharpMethodDeclaration = {
    kind: "MethodDeclaration",
    name: csharpJsonValueProjectionMethodName,
    modifiers: [...planCsharpArtifactMemberHiding(names, fact, csharpJsonValueProjectionMethodName), "public"],
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
  if (contract.kind === "to-json") {
    return [
      projectionMethod,
      {
        kind: "MethodDeclaration",
        name: csharpJsonValueWriterMethodName,
        modifiers: [...planCsharpArtifactMemberHiding(names, fact, csharpJsonValueWriterMethodName), "public"],
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
  for (const member of contract.properties) {
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
          { kind: "LiteralExpression" as const, value: member.key },
          { kind: "IdentifierName" as const, name: member.name },
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
      modifiers: [...planCsharpArtifactMemberHiding(names, fact, csharpJsonValueWriterMethodName), "public"],
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

function createJsonObjectProjection(properties: Extract<CsharpJsonObjectShapeContract, { readonly kind: "properties" }>["properties"]): CsharpExpression {
  const values: CsharpExpression[] = [];
  for (const member of properties) {
    values.push(
      { kind: "LiteralExpression", value: member.key },
      { kind: "IdentifierName", name: member.name },
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
