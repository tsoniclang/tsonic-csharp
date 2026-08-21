import type {
  Node,
} from "@tsonic/tsts";
import {
  csharpBigIntFitsSourcePrimitive,
  csharpBigIntLiteralValue,
  csharpNumericLiteralFitsSourcePrimitive,
  csharpNumericLiteralValue,
} from "../../target-model/syntax/numeric-literals.js";
import type {
  CsharpPolicyContext,
} from "../context.js";
import type {
  TargetTypeRef,
} from "../types/index.js";
import {
  getCsharpArrayLiteralElementTargetType,
  getCsharpNullableElementTargetType,
  isCsharpStringTargetType,
} from "../types/index.js";

export function csharpLiteralIsRepresentableAs(
  input: Pick<CsharpPolicyContext, "ast">,
  node: Node,
  target: TargetTypeRef,
): boolean {
  const nullableElement = getCsharpNullableElementTargetType(target);
  if (nullableElement !== undefined) {
    return csharpLiteralIsRepresentableAs(input, node, nullableElement);
  }
  if (input.ast.is.IsArrayLiteralExpression(node)) {
    const elementType = target.kind === "array"
      ? target.element
      : getCsharpArrayLiteralElementTargetType(target);
    return elementType !== undefined &&
      input.ast.elements(node).every((element) =>
        element !== undefined &&
        csharpLiteralIsRepresentableAs(input, element, elementType));
  }
  if (isCsharpStringTargetType(target)) {
    return input.ast.is.IsStringLiteral(node) ||
      input.ast.is.IsNoSubstitutionTemplateLiteral(node);
  }
  if (target.kind !== "source-primitive") {
    return false;
  }
  switch (target.name) {
    case "bool":
      return input.ast.kindName(node) === "KindTrueKeyword" ||
        input.ast.kindName(node) === "KindFalseKeyword";
    case "char":
      return (
        input.ast.is.IsStringLiteral(node) ||
        input.ast.is.IsNoSubstitutionTemplateLiteral(node)
      ) &&
        input.ast.text(node).length === 1;
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "native-int":
    case "native-uint": {
      return csharpNumericLiteralFitsSourcePrimitive(
        input.ast,
        node,
        target.name,
      );
    }
    case "float16":
    case "float32":
    case "float64":
    case "decimal": {
      const value = csharpNumericLiteralValue(input.ast, node);
      return value !== undefined && Number.isFinite(value);
    }
    case "int64":
    case "uint64":
    case "int128":
    case "uint128": {
      const value = csharpBigIntLiteralValue(input.ast, node);
      return value !== undefined &&
        csharpBigIntFitsSourcePrimitive(value, target.name);
    }
  }
}
