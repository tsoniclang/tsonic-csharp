import type {
  Node,
} from "@tsonic/tsts";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  csharpBigIntFitsSourcePrimitive,
  csharpBigIntLiteralValue,
  csharpLiteralIsRepresentableAs,
} from "../../../policy/conversions/index.js";
import type {
  TargetTypeRef,
} from "../../../policy/types/index.js";
import {
  getCsharpNullableElementTargetType,
} from "../../../policy/types/index.js";
import {
  csharpNumericLiteralValue,
} from "../../../policy/types/resolution/source-literal-policy.js";
import type {
  CsharpPlanningContext,
} from "../context.js";

export function planCsharpExactLiteralConversion(
  input: Pick<CsharpPlanningContext, "ast">,
  node: Node,
  target: TargetTypeRef | undefined,
): CsharpExactLiteralConversionPlan {
  if (target === undefined) {
    return { kind: "not-applicable" };
  }
  const targetType = getCsharpNullableElementTargetType(target) ?? target;
  if (targetType.kind !== "source-primitive") {
    return csharpLiteralIsRepresentableAs(input, node, target)
      ? { kind: "source-representation" }
      : { kind: "not-applicable" };
  }
  switch (targetType.name) {
    case "char": {
      if (
        !input.ast.is.IsStringLiteral(node) &&
        !input.ast.is.IsNoSubstitutionTemplateLiteral(node)
      ) {
        return { kind: "not-applicable" };
      }
      const value = input.ast.text(node);
      return value.length === 1
        ? {
            kind: "resolved",
            expression: {
              kind: "CharacterLiteralExpression",
              value,
            },
          }
        : {
            kind: "rejected",
            reason: "C# char literals require exactly one UTF-16 code unit from TSTS/source primitive typing.",
          };
    }
    case "float16":
    case "float32":
    case "decimal": {
      if (
        !input.ast.is.IsNumericLiteral(node) &&
        !input.ast.is.IsPrefixUnaryExpression(node)
      ) {
        return { kind: "not-applicable" };
      }
      const value = csharpNumericLiteralValue(input.ast, node);
      if (value === undefined || !Number.isFinite(value)) {
        return {
          kind: "rejected",
          reason: "C# numeric literal conversion requires an exact finite source value.",
        };
      }
      if (targetType.name === "float16") {
        const type = csharpTypeFromTargetTypeRef(targetType);
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
                expression: { kind: "LiteralExpression", value },
              },
            };
      }
      return {
        kind: "resolved",
        expression: {
          kind: "NumericLiteralExpression",
          value,
          suffix: targetType.name === "float32" ? "F" : "M",
        },
      };
    }
    case "int64":
    case "uint64":
    case "int128":
    case "uint128": {
      const value = csharpBigIntLiteralValue(input.ast, node);
      if (value === undefined) {
        return { kind: "not-applicable" };
      }
      if (!csharpBigIntFitsSourcePrimitive(value, targetType.name)) {
        return {
          kind: "rejected",
          reason: `Source bigint literal is outside the exact '${targetType.name}' range.`,
        };
      }
      const expression = planWideIntegerLiteral(value, targetType);
      return expression === undefined
        ? {
            kind: "rejected",
            reason: `Source bigint literal has no exact renderable '${targetType.name}' target representation.`,
          }
        : { kind: "resolved", expression };
    }
    default:
      return csharpLiteralIsRepresentableAs(input, node, target)
        ? { kind: "source-representation" }
        : { kind: "not-applicable" };
  }
}

export type CsharpExactLiteralConversionPlan =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "source-representation" }
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string };

function planWideIntegerLiteral(
  value: bigint,
  target: Extract<TargetTypeRef, { readonly kind: "source-primitive" }>,
): CsharpExpression | undefined {
  switch (target.name) {
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
      return int128Literal(value, target);
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
  value: bigint,
  target: Extract<TargetTypeRef, { readonly kind: "source-primitive" }>,
): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(target);
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
