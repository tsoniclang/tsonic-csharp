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
import {
  csharpDelegateSignatureFromTargetTypeRef,
} from "../expression-lambdas.js";

export function getCsharpCallableContextualType(
  node: Node,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const contextualTargetType = input.facts.getContextualTargetTypeFact(node)?.targetType;
  const csharpType = contextualTargetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(contextualTargetType);
  return csharpType !== undefined && csharpDelegateSignatureFromTargetTypeRef(contextualTargetType) !== undefined
    ? csharpType
    : undefined;
}
