import type { SourceLiteralUnit } from "@tsonic/target-api/source";

export function csharpFloat64LiteralValue(unit: SourceLiteralUnit): number | undefined {
  if (unit.kind !== "number") return undefined;
  const value = unit.value;
  return value.kind === "authored" ? Number(value.token.decimalText) * (value.token.negative ? -1 : 1)
    : value.kind === "integer" ? Number(value.value) : value.value;
}

export interface CsharpNumericLiteralToken {
  readonly significand: string;
  readonly exponent?: string;
}

export function createCsharpNumericLiteralToken(text: string): CsharpNumericLiteralToken {
  const components = /^((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)(?:e([+-]?(?:0|[1-9][0-9]*)))?$/u.exec(text);
  if (components === null) {
    throw new Error("C# exact numeric tokens require unsigned decimal significand and exponent grammar.");
  }
  const significand = components[1]!;
  const exponent = components[2];
  return Object.freeze({ significand, ...(exponent === undefined ? {} : { exponent }) });
}
