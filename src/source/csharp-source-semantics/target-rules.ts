import type {
  SourcePrimitiveKind,
  TargetTypeRef,
} from "@tsonic/tsts";
import { targetOperation } from "./operations.js";

export function sourcePrimitiveRuntimeKind(kind: SourcePrimitiveKind): "string" | "number" | "boolean" | "bigint" {
  if (kind === "bool") {
    return "boolean";
  }
  if (kind === "char") {
    return "string";
  }
  return kind === "int64" || kind === "uint64" || kind === "int128" || kind === "uint128"
    ? "bigint"
    : "number";
}

export function getCsharpOperatorTargetOperation(operator: string): string | undefined {
  switch (operator) {
    case "===":
    case "==":
      return "==";
    case "!==":
    case "!=":
      return "!=";
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "&&":
    case "||":
    case "??":
    case "&":
    case "|":
    case "^":
    case "<<":
    case ">>":
    case ">>>":
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "/=":
    case "%=":
    case "&=":
    case "|=":
    case "^=":
    case "<<=":
    case ">>=":
    case ">>>=":
    case "!":
    case "~":
    case "++":
    case "--":
      return operator;
    default:
      return undefined;
  }
}

export function isCsharpBitwiseOperator(operator: string): boolean {
  return operator === "&" ||
    operator === "|" ||
    operator === "^" ||
    operator === "<<" ||
    operator === ">>" ||
    operator === ">>>" ||
    operator === "&=" ||
    operator === "|=" ||
    operator === "^=" ||
    operator === "<<=" ||
    operator === ">>=" ||
    operator === ">>>=" ||
    operator === "~";
}

export function isIntegralTargetTypeRef(type: TargetTypeRef | undefined): boolean {
  if (type?.kind !== "source-primitive") {
    return false;
  }
  switch (type.name) {
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "int64":
    case "uint64":
    case "native-int":
    case "native-uint":
    case "int128":
    case "uint128":
      return true;
    default:
      return false;
  }
}

export function getCsharpConversionOperation(source: TargetTypeRef | undefined, target: TargetTypeRef) {
  if (source?.kind === "source-primitive" && target.kind === "source-primitive" && source.name !== target.name) {
    const methodName = sourcePrimitiveConversionMethod(target.name);
    return methodName === undefined
      ? undefined
      : targetOperation(`System.Convert.${methodName}`, "method", `System.Convert.${methodName}`);
  }
  return undefined;
}

export function isVoidTargetType(type: TargetTypeRef): boolean {
  return type.kind === "target-named" && type.id === "System.Void";
}

export function isCsharpStringType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === "System.String";
}

function sourcePrimitiveConversionMethod(kind: SourcePrimitiveKind): string | undefined {
  switch (kind) {
    case "bool":
      return "ToBoolean";
    case "int8":
      return "ToSByte";
    case "uint8":
      return "ToByte";
    case "int16":
      return "ToInt16";
    case "uint16":
      return "ToUInt16";
    case "int32":
    case "native-int":
      return "ToInt32";
    case "uint32":
    case "native-uint":
      return "ToUInt32";
    case "int64":
      return "ToInt64";
    case "uint64":
      return "ToUInt64";
    case "float32":
    case "float16":
      return "ToSingle";
    case "float64":
      return "ToDouble";
    case "decimal":
      return "ToDecimal";
    case "char":
    case "int128":
    case "uint128":
      return undefined;
  }
}
