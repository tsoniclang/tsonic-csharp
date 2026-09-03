import type { CsharpCompilationUnit } from "../roslyn/index.js";
import { transformCsharpTargetAst } from "./transformation.js";

export function applyReadableCsharpStringLiterals(
  unit: CsharpCompilationUnit,
): CsharpCompilationUnit {
  return transformCsharpTargetAst(unit, (record) => {
    if (
      record.kind !== "LiteralExpression" ||
      typeof record.value !== "string" ||
      !canUseMultilineRawString(record.value)
    ) {
      return record;
    }
    return {
      ...record,
      stringStyle: "raw",
    };
  });
}

function canUseMultilineRawString(value: string): boolean {
  if (!value.includes("\n") || value.includes("\r")) {
    return false;
  }
  if (value.split("\n").filter((line) => line.trim().length > 0).length < 2) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code < 0x20 && code !== 0x09 && code !== 0x0a ||
      code >= 0x7f && code <= 0x9f ||
      code === 0x2028 ||
      code === 0x2029 ||
      code >= 0xd800 && code <= 0xdfff && !isValidSurrogatePair(value, index)
    ) {
      return false;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      index += 1;
    }
  }
  return true;
}

function isValidSurrogatePair(value: string, index: number): boolean {
  const code = value.charCodeAt(index);
  if (code < 0xd800 || code > 0xdbff) {
    return false;
  }
  const next = value.charCodeAt(index + 1);
  return next >= 0xdc00 && next <= 0xdfff;
}
