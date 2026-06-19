import {
  AsArrayTypeNode,
  AsIdentifier,
  AsPropertyAccessExpression,
  KindArrayType,
  KindIdentifier,
  KindPropertyAccessExpression,
  Node_Text,
  TypeFlagsAny,
  TypeFlagsBigIntLike,
  TypeFlagsBooleanLike,
  TypeFlagsNever,
  TypeFlagsNumberLike,
  TypeFlagsStringLike,
  TypeFlagsUnknown,
  TypeFlagsVoidLike,
} from "@tsonic/tsts";
import type { Node, SourceFile, SourcePrimitiveFact } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import type { CsharpTypeNode } from "../ast/csharp-ast.js";
import { sanitizeIdentifier } from "./identifiers.js";

export function expressionToCsharpType(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpTypeNode {
  if (node === undefined) {
    return predefined("object");
  }
  switch (node.Kind) {
    case KindIdentifier:
      return { kind: "named", name: sanitizeIdentifier(AsIdentifier(node)!.Text) };
    case KindPropertyAccessExpression: {
      const expression = AsPropertyAccessExpression(node)!;
      const receiver = expressionToCsharpType(expression.Expression, sourceFile, input);
      const name = sanitizeIdentifier(Node_Text(expression.name!));
      return { kind: "qualified", left: receiver, name };
    }
    default:
      return getCsharpTypeForNode(node, sourceFile, input);
  }
}

export function getCsharpTypeForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  fallback: CsharpTypeNode = predefined("object"),
): CsharpTypeNode {
  if (node === undefined) {
    return fallback;
  }
  if (node.Kind === KindArrayType) {
    const arrayType = AsArrayTypeNode(node)!;
    return {
      kind: "array",
      elementType: getCsharpTypeForNode(arrayType.ElementType, sourceFile, input),
    };
  }
  const sourcePrimitive = input.facts.getSourcePrimitiveFact(node);
  if (sourcePrimitive !== undefined) {
    return getCsharpTypeForSourcePrimitive(sourcePrimitive);
  }
  const type = input.checker.getTypeAtLocation(node, { sourceFile });
  if (type === undefined) {
    return fallback;
  }
  const typeText = input.checker.typeToString(type, { sourceFile });
  if (typeText === "void") {
    return predefined("void");
  }
  if ((type.flags & TypeFlagsStringLike) !== 0) {
    return predefined("string");
  }
  if ((type.flags & TypeFlagsBooleanLike) !== 0) {
    return predefined("bool");
  }
  if ((type.flags & TypeFlagsBigIntLike) !== 0) {
    return predefined("long");
  }
  if ((type.flags & TypeFlagsNumberLike) !== 0) {
    return predefined("double");
  }
  if ((type.flags & TypeFlagsVoidLike) !== 0) {
    return predefined("void");
  }
  if ((type.flags & (TypeFlagsAny | TypeFlagsUnknown | TypeFlagsNever)) !== 0) {
    return predefined("object");
  }
  return fallback;
}

export function getCsharpTypeForSourcePrimitive(fact: SourcePrimitiveFact): CsharpTypeNode {
  switch (fact.kind) {
    case "bool":
      return predefined("bool");
    case "char":
      return predefined("char");
    case "int8":
      return predefined("sbyte");
    case "uint8":
      return predefined("byte");
    case "int16":
      return predefined("short");
    case "uint16":
      return predefined("ushort");
    case "int32":
      return predefined("int");
    case "uint32":
      return predefined("uint");
    case "int64":
      return predefined("long");
    case "uint64":
      return predefined("ulong");
    case "native-int":
      return predefined("nint");
    case "native-uint":
      return predefined("nuint");
    case "float16":
      return { kind: "named", name: "Half" };
    case "float32":
      return predefined("float");
    case "float64":
      return predefined("double");
    case "decimal":
      return predefined("decimal");
    case "int128":
      return { kind: "named", name: "Int128" };
    case "uint128":
      return { kind: "named", name: "UInt128" };
  }
}

export function sameCsharpType(left: CsharpTypeNode, right: CsharpTypeNode): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "predefined":
      return right.kind === "predefined" && left.name === right.name;
    case "named": {
      if (right.kind !== "named" || left.name !== right.name) {
        return false;
      }
      const leftArgs = left.typeArguments ?? [];
      const rightArgs = right.typeArguments ?? [];
      return leftArgs.length === rightArgs.length && leftArgs.every((arg, index) => sameCsharpType(arg, rightArgs[index]!));
    }
    case "qualified": {
      if (right.kind !== "qualified" || left.name !== right.name || !sameCsharpType(left.left, right.left)) {
        return false;
      }
      const leftArgs = left.typeArguments ?? [];
      const rightArgs = right.typeArguments ?? [];
      return leftArgs.length === rightArgs.length && leftArgs.every((arg, index) => sameCsharpType(arg, rightArgs[index]!));
    }
    case "array":
      return right.kind === "array" && (left.rank ?? 1) === (right.rank ?? 1) && sameCsharpType(left.elementType, right.elementType);
  }
}

export function predefined(name: string): CsharpTypeNode {
  return { kind: "predefined", name };
}
