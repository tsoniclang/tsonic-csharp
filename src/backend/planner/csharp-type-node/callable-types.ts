import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";

export function isDelegateTypeNode(type: CsharpTypeNode): boolean {
  if (type.kind === "NullableType") {
    return isDelegateTypeNode(type.inner);
  }
  return type.kind === "IdentifierName" &&
    (type.name === "Func" || type.name === "Action" || type.name === "Predicate");
}

export function getCsharpCallableContextualType(
  node: Node,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const contextualTargetType = input.facts.getContextualTargetTypeFact(node)?.targetType;
  const csharpType = contextualTargetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(contextualTargetType);
  return csharpType !== undefined && isDelegateTypeNode(csharpType)
    ? csharpType
    : undefined;
}
