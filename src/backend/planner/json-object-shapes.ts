import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  CsharpExpression,
  CsharpMethodDeclaration,
  CsharpStatement,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
} from "../../policy/types/index.js";
import {
  objectShapeStorageMemberName,
} from "./object-shape-storage.js";

export const csharpJsonValueWriterMethodName = "__tsonicWriteJson";

export function objectShapeRequiresJsonSerialization(
  input: CsharpTranslationContext,
  fact: CsharpObjectShapeFact,
): boolean {
  return input.artifacts.objectShapeRequiresJsonSerialization(fact);
}

export function csharpJsonValueInterfaceType(): CsharpTypeNode {
  return qualifiedType("Tsonic.CSharp.Js", "IJsonValue");
}

export function renderJsonSerializableObjectShapeMethod(
  fact: CsharpObjectShapeFact,
): CsharpMethodDeclaration {
  const writer = { kind: "IdentifierName", name: "writer" } as const;
  const context = { kind: "IdentifierName", name: "context" } as const;
  const statements: CsharpStatement[] = [
    expressionStatement(invokeMember(writer, "WriteStartObject")),
  ];
  for (const member of fact.members) {
    if (member.memberKind === "method") {
      continue;
    }
    statements.push(
      expressionStatement(invokeMember(writer, "WritePropertyName", [{ kind: "LiteralExpression", value: member.sourceName }])),
      expressionStatement({
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: qualifiedType("Tsonic.CSharp.Js", "JSON"),
          name: "writeValue",
        },
        arguments: [writer, { kind: "IdentifierName" as const, name: objectShapeStorageMemberName(fact, member) }, context]
          .map((expression) => ({ kind: "Argument" as const, expression })),
      }),
    );
  }
  statements.push(expressionStatement(invokeMember(writer, "WriteEndObject")));
  return {
    kind: "MethodDeclaration",
    name: csharpJsonValueWriterMethodName,
    modifiers: ["public"],
    returnType: { kind: "PredefinedType", name: "void" },
    parameters: [
      { name: "writer", type: qualifiedType("System.Text.Json", "Utf8JsonWriter") },
      { name: "context", type: qualifiedType("Tsonic.CSharp.Js", "JsonWriteContext") },
    ],
    body: { kind: "Block", statements },
  };
}

function qualifiedType(namespace: string, name: string): CsharpTypeNode {
  const parts = namespace.split(".");
  let current: CsharpTypeNode = { kind: "IdentifierName", name: parts[0] ?? namespace };
  for (const part of parts.slice(1)) {
    current = { kind: "QualifiedName", left: current, name: part };
  }
  return { kind: "QualifiedName", left: current, name };
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
