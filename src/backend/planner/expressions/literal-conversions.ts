import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type {
  Node,
} from "@tsonic/tsts";
import type {
  CsharpExpression,
} from "../../target-ast/syntax/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import type {
  CsharpExactLiteralPrimitive,
  CsharpExactLiteralRecipe,
} from "../../../target-model/conversions/exact-literals.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import { createCsharpNumericLiteralToken } from "../../../target-model/syntax/numeric-literals.js";

const floatingZero = createCsharpNumericLiteralToken("0");

export function planCsharpExactLiteralConversion(
  input: CsharpPlanningContext,
  node: Node,
  target: TargetTypeRef | undefined,
): CsharpExactLiteralConversionPlan {
  const selection = input.program.records.exactLiteral.get(node, target);
  if (selection === undefined) {
    return failCsharpPlannerInvariant(
      "C# literal planning requires the sealed exact-literal selection of its requested target.", node);
  }
  return selection.kind === "resolved" ? planCsharpExactLiteralRecipe(input.scope.typeParameterNames, selection.recipe) : selection;
}

export type CsharpExactLiteralConversionPlan =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "source-representation" }
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string };

export function planCsharpExactLiteralRecipe(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  recipe: CsharpExactLiteralRecipe,
): CsharpExactLiteralConversionPlan {
  switch (recipe.kind) {
    case "signed-zero": {
      const zero: CsharpExpression = {
        kind: "PrefixUnaryExpression",
        operatorToken: { kind: "MinusToken" },
        operand: recipe.precision === "float64"
          ? { kind: "NumericLiteralExpression", value: 0, suffix: "D" }
          : { kind: "NumericLiteralExpression", token: floatingZero, suffix: "F" },
      };
      if (recipe.precision !== "float16") return { kind: "resolved", expression: zero };
      const halfType = csharpTypeFromTargetTypeRef(recipe.target, typeParameterNames);
      return halfType === undefined
        ? { kind: "rejected", reason: "C# Half signed-zero conversion requires an exact renderable target type." }
        : { kind: "resolved", expression: {
            kind: "CastExpression", type: halfType, expression: zero,
          } };
    }
    case "string":
      return { kind: "resolved", expression: { kind: "LiteralExpression", value: recipe.value } };
    case "char":
      return {
        kind: "resolved",
        expression: {
          kind: "CharacterLiteralExpression",
          value: recipe.value,
        },
      };
    case "float": {
      if ("value" in recipe) {
        const type = csharpTypeFromTargetTypeRef(recipe.target, typeParameterNames);
        return type === undefined
          ? {
              kind: "rejected",
              reason: "C# Half literal conversion requires an exact renderable target type.",
            }
          : {
              kind: "resolved",
              expression: {
                kind: "CastExpression",
                type,
                expression: { kind: "LiteralExpression", value: recipe.value },
              },
            };
      }
      const literal: CsharpExpression = { kind: "NumericLiteralExpression", token: recipe.token,
        suffix: recipe.precision === "float32" ? "F" : recipe.precision === "decimal" ? "M" : "D" };
      const expression: CsharpExpression = recipe.negative
        ? { kind: "PrefixUnaryExpression", operatorToken: { kind: "MinusToken" }, operand: literal }
        : literal;
      if (recipe.precision !== "float16") return { kind: "resolved", expression };
      const type = csharpTypeFromTargetTypeRef(recipe.target, typeParameterNames);
      return type === undefined ? { kind: "rejected", reason: "C# Half property key requires its exact renderable target type." }
        : { kind: "resolved", expression: { kind: "CastExpression", type, expression } };
    }
    case "integer": {
      const expression = planIntegerLiteral(typeParameterNames, recipe.value, recipe.target);
      return expression === undefined
        ? {
            kind: "rejected",
            reason: `Source bigint literal has no exact renderable '${recipe.width}' target representation.`,
          }
        : { kind: "resolved", expression };
    }
  }
}

function planIntegerLiteral(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  value: bigint,
  target: CsharpExactLiteralPrimitive,
): CsharpExpression | undefined {
  switch (target.name) {
    case "int32":
      return { kind: "LiteralExpression", value: Number(value) };
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "uint32": {
      const type = csharpTypeFromTargetTypeRef(target, typeParameterNames);
      return type === undefined ? undefined : {
        kind: "CastExpression", type, expression: { kind: "LiteralExpression", value: Number(value) },
      };
    }
    case "native-int":
    case "native-uint": {
      const type = csharpTypeFromTargetTypeRef(target, typeParameterNames);
      const literal = planIntegerLiteral(typeParameterNames, value, {
        kind: "source-primitive", name: target.name === "native-int" ? "int64" : "uint64",
      });
      return type === undefined || literal === undefined ? undefined : {
        kind: "InvocationExpression",
        callee: { kind: "SimpleMemberAccessExpression", receiver: type, name: "CreateChecked" },
        arguments: [{ kind: "Argument", expression: literal }],
      };
    }
    case "int64":
      return value === -(1n << 63n)
        ? {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "PredefinedType", name: "long" },
            name: "MinValue",
          }
        : signedInt64Literal(value);
    case "uint64":
      return unsignedInt64Literal(value);
    case "int128":
    case "uint128":
      return int128Literal(typeParameterNames, value, target);
    default:
      return undefined;
  }
}

function signedInt64Literal(value: bigint): CsharpExpression {
  const literal = {
    kind: "IntegerLiteralExpression" as const,
    digits: (value < 0n ? -value : value).toString(10),
    suffix: "L" as const,
  };
  return value < 0n
    ? {
        kind: "PrefixUnaryExpression",
        operatorToken: { kind: "MinusToken" },
        operand: literal,
      }
    : literal;
}

function unsignedInt64Literal(value: bigint): CsharpExpression {
  return {
    kind: "IntegerLiteralExpression",
    digits: value.toString(10),
    suffix: "UL",
  };
}

function int128Literal(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  value: bigint,
  target: CsharpExactLiteralPrimitive,
): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(target, typeParameterNames);
  if (type === undefined) {
    return undefined;
  }
  const bitWidth = 128n;
  const bits = value < 0n ? (1n << bitWidth) + value : value;
  const mask = (1n << 64n) - 1n;
  return {
    kind: "ObjectCreationExpression",
    type,
    arguments: [
      { kind: "Argument", expression: unsignedInt64Literal(bits >> 64n) },
      { kind: "Argument", expression: unsignedInt64Literal(bits & mask) },
    ],
  };
}
