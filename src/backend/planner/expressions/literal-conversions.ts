import type {
  Node,
} from "@tsonic/tsts";
import type {
  CsharpExpression,
} from "../../target-ast/syntax/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  csharpBigIntFitsSourcePrimitive,
  csharpNumericLiteralFitsSourcePrimitive,
} from "../../../target-model/syntax/numeric-literals.js";
import type {
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  getCsharpNullableElementTargetType,
} from "../../../target-model/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type { CsharpSourceLiteralValue } from "../../../target-model/records/source-literals.js";

export function planCsharpExactLiteralConversion(
  input: CsharpPlanningContext,
  node: Node,
  target: TargetTypeRef | undefined,
): CsharpExactLiteralConversionPlan {
  if (target === undefined) {
    return { kind: "not-applicable" };
  }
  const targetType = getCsharpNullableElementTargetType(target) ?? target;
  const literal = input.program.records.literalValue.get(node);
  if (targetType.kind !== "source-primitive") {
    return classifiedLiteralRepresentation(literal);
  }
  if ((literal?.form === "binary" || literal?.form === "parenthesized") &&
    literal.integerConstant !== undefined && csharpBigIntFitsSourcePrimitive(literal.integerConstant, targetType.name)) {
    return { kind: "source-representation" };
  }
  if (Object.is(literal?.number, -0)) {
    if (targetType.name === "float64" || targetType.name === "float32" || targetType.name === "float16") {
      const zero: CsharpExpression = {
        kind: "PrefixUnaryExpression",
        operatorToken: { kind: "MinusToken" },
        operand: { kind: "NumericLiteralExpression", value: 0, suffix: targetType.name === "float64" ? "D" : "F" },
      };
      if (targetType.name !== "float16") return { kind: "resolved", expression: zero };
      const halfType = csharpTypeFromTargetTypeRef(targetType, input.scope.typeParameterNames);
      return halfType === undefined
        ? { kind: "rejected", reason: "C# Half signed-zero conversion requires an exact renderable target type." }
        : { kind: "resolved", expression: {
            kind: "CastExpression", type: halfType, expression: { kind: "ParenthesizedExpression", expression: zero },
          } };
    }
    if (targetType.name !== "decimal" && csharpNumericLiteralFitsSourcePrimitive(literal, targetType.name)) {
      return { kind: "resolved", expression: { kind: "LiteralExpression", value: 0 } };
    }
  }
  switch (targetType.name) {
    case "char": {
      if ((literal?.form !== "string" && literal?.form !== "template") || literal.text === undefined) {
        return { kind: "not-applicable" };
      }
      const value = literal.text;
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
      if (literal?.form !== "numeric" && literal?.form !== "prefix-unary") {
        return { kind: "not-applicable" };
      }
      const value = literal.number;
      if (value === undefined || !Number.isFinite(value)) {
        return {
          kind: "rejected",
          reason: "C# numeric literal conversion requires an exact finite source value.",
        };
      }
      if (targetType.name === "float16") {
        const type = csharpTypeFromTargetTypeRef(targetType, input.scope.typeParameterNames);
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
    case "uint128":
    case "native-int":
    case "native-uint": {
      const value = literal?.integer;
      if (value === undefined) {
        return { kind: "not-applicable" };
      }
      if (!csharpBigIntFitsSourcePrimitive(value, targetType.name)) {
        return {
          kind: "rejected",
          reason: `Source bigint literal is outside the exact '${targetType.name}' range.`,
        };
      }
      const expression = planWideIntegerLiteral(input.scope.typeParameterNames, value, targetType);
      return expression === undefined
        ? {
            kind: "rejected",
            reason: `Source bigint literal has no exact renderable '${targetType.name}' target representation.`,
          }
        : { kind: "resolved", expression };
    }
    default:
      return classifiedLiteralRepresentation(literal);
  }
}

export type CsharpExactLiteralConversionPlan =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "source-representation" }
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string };

function classifiedLiteralRepresentation(
  literal: CsharpSourceLiteralValue | undefined,
): CsharpExactLiteralConversionPlan {
  return literal !== undefined && literal.form !== "parenthesized" && literal.form !== "binary"
    ? { kind: "source-representation" }
    : { kind: "not-applicable" };
}

function planWideIntegerLiteral(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  value: bigint,
  target: Extract<TargetTypeRef, { readonly kind: "source-primitive" }>,
): CsharpExpression | undefined {
  switch (target.name) {
    case "native-int":
    case "native-uint": {
      const type = csharpTypeFromTargetTypeRef(target, typeParameterNames);
      const literal = planWideIntegerLiteral(typeParameterNames, value, {
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
  target: Extract<TargetTypeRef, { readonly kind: "source-primitive" }>,
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
