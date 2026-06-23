import type {
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "./target-types.js";

export function resolveTargetTypeRefFromKeywordTypeSyntax(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): TargetTypeRef | undefined {
  switch (ast.kindName(node)) {
    case "KindBooleanKeyword":
      return csharpSourcePrimitiveTargetType("bool");
    case "KindNumberKeyword":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindStringKeyword":
      return csharpStringTargetType();
    case "KindBigIntKeyword":
      return csharpBigIntegerTargetType();
    case "KindVoidKeyword":
      return csharpVoidTargetType();
    default:
      return undefined;
  }
}
