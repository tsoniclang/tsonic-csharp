import type {
  CsharpTypeMember,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  nullableCsharpType,
  qualifiedCsharpType,
} from "./csharp-types.js";
import type {
  CsharpOutputSourceFile,
} from "./csharp-output-plan.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import {
  csharpGeneratedConversionHelperName,
  csharpGeneratedHelperNamespace,
} from "../../translate/artifacts/generated-helpers.js";

export function planCsharpGeneratedHelperSourceFile(
  input: CsharpTranslationContext,
): CsharpOutputSourceFile | undefined {
  const helpers = input.artifacts.generatedHelpers();
  if (helpers.length === 0) {
    return undefined;
  }
  const members = helpers.flatMap((helper): readonly CsharpTypeMember[] => {
    switch (helper) {
      case "lifted-provider-argument-adapter":
        return [liftNullableMethod()];
    }
  });
  return {
    path: "generated/TsonicConversions.cs",
    unit: {
      kind: "CompilationUnit",
      usings: [],
      members: [{
        kind: "NamespaceDeclaration",
        name: csharpGeneratedHelperNamespace,
        members: [{
          kind: "ClassDeclaration",
          name: csharpGeneratedConversionHelperName,
          modifiers: ["internal", "static"],
          members,
        }],
      }],
    },
  };
}

function liftNullableMethod(): CsharpTypeMember {
  const sourceType: CsharpTypeNode = {
    kind: "IdentifierName",
    name: "TSource",
  };
  const resultType: CsharpTypeNode = {
    kind: "IdentifierName",
    name: "TResult",
  };
  const nullableResultType = nullableCsharpType(resultType);
  return {
    kind: "MethodDeclaration",
    name: "LiftNullable",
    modifiers: ["internal", "static"],
    typeParameters: [
      {
        name: "TSource",
        constraints: [{ kind: "KeywordConstraint", keyword: "struct" }],
      },
      {
        name: "TResult",
        constraints: [{ kind: "KeywordConstraint", keyword: "struct" }],
      },
    ],
    returnType: nullableResultType,
    parameters: [
      {
        name: "value",
        type: nullableCsharpType(sourceType),
      },
      {
        name: "conversion",
        type: qualifiedCsharpType(
          "System",
          "Func",
          [sourceType, resultType],
        ),
      },
    ],
    body: {
      kind: "Block",
      statements: [{
        kind: "ReturnStatement",
        expression: {
          kind: "ConditionalExpression",
          condition: {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "IdentifierName", name: "value" },
            name: "HasValue",
          },
          whenTrue: {
            kind: "InvocationExpression",
            callee: { kind: "IdentifierName", name: "conversion" },
            arguments: [{
              kind: "Argument",
              expression: {
                kind: "SimpleMemberAccessExpression",
                receiver: { kind: "IdentifierName", name: "value" },
                name: "Value",
              },
            }],
          },
          whenFalse: {
            kind: "DefaultExpression",
            type: nullableResultType,
          },
        },
      }],
    },
  };
}
