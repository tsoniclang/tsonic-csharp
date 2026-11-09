import type { CsharpCallArgumentEmissionGroup } from "../../../../target-model/records/calls/target-arguments.js";
import type { CsharpExpression } from "../../../target-ast/syntax/index.js";
import { csharpTypeFromSourcePrimitiveKind, csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { planIntegerLiteral } from "../literal-conversions.js";
import { createCsharpNumericLiteralToken } from "../../../../target-model/syntax/numeric-literals.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";

export function planCsharpNativeDefault(
  selected: Extract<CsharpCallArgumentEmissionGroup, { readonly kind: "native-default" }>,
  typeParameterNames: ReadonlyMap<string, string> | undefined,
): CsharpExpression {
  const type = csharpTypeFromTargetTypeRef(selected.type, typeParameterNames)
    ?? failCsharpPlannerInvariant("A sealed Native default requires its exact physical parameter type.");
  const value = selected.value;
  if (value.kind === "null") return { kind: "DefaultExpression", type, nullForgiving: true };
  let expression: CsharpExpression;
  if (value.kind === "string") expression = { kind: "LiteralExpression", value: value.value };
  else if (value.kind === "enum") {
    const integer = BigInt(value.value);
    expression = planIntegerLiteral(typeParameterNames, integer,
      { kind: "source-primitive", name: integer < 0n ? "int64" : "uint64" })
      ?? failCsharpPlannerInvariant("A sealed Native enum default requires its admitted integer payload.");
  } else if (value.name === "bool" && typeof value.value === "boolean") expression = { kind: "LiteralExpression", value: value.value };
  else if (value.name === "char" && typeof value.value === "string") expression = { kind: "CharacterLiteralExpression", value: value.value };
  else {
    if (typeof value.value !== "string") return failCsharpPlannerInvariant("A sealed Native numeric default requires its original constant token.");
    switch (value.name) {
      case "int8": case "uint8": case "int16": case "uint16": case "int32": case "uint32": case "int64": case "uint64":
        expression = planIntegerLiteral(typeParameterNames, BigInt(value.value), { kind: "source-primitive", name: value.name })
          ?? failCsharpPlannerInvariant("A sealed Native integer default requires its admitted physical constant.");
        break;
      case "float32": case "float64": case "decimal": {
        if (value.value === "NaN" || value.value === "Infinity" || value.value === "-Infinity") {
          expression = { kind: "SimpleMemberAccessExpression", receiver: csharpTypeFromSourcePrimitiveKind(value.name),
            name: value.value === "NaN" ? "NaN" : value.value === "Infinity" ? "PositiveInfinity" : "NegativeInfinity" };
          break;
        }
        const token = createCsharpNumericLiteralToken(value.value.replace(/^-/, "").replace(/E/u, "e"));
        const literal: CsharpExpression = { kind: "NumericLiteralExpression", token,
          suffix: value.name === "float32" ? "F" : value.name === "decimal" ? "M" : "D" };
        expression = value.value.startsWith("-") ? { kind: "PrefixUnaryExpression", operatorToken: { kind: "MinusToken" }, operand: literal } : literal;
        break;
      }
      default: return failCsharpPlannerInvariant("A Native default must be completely admitted before printing.");
    }
  }
  return { kind: "CastExpression", type, expression };
}
