import type {
  Node,
  TargetBindingFact,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";

export function getDirectTargetBindingForReference(
  input: TargetCompileInput,
  node: Node,
): TargetBindingFact | undefined {
  const direct = input.facts.getTargetBindingFact(node);
  if (direct !== undefined) {
    return direct;
  }
  if (input.ast.is.IsTypeReferenceNode(node)) {
    return input.facts.getTargetBindingFact(input.ast.as.AsTypeReferenceNode(node)!.TypeName);
  }
  if (input.ast.is.IsExpressionWithTypeArguments(node)) {
    return input.facts.getTargetBindingFact(input.ast.as.AsExpressionWithTypeArguments(node)!.Expression);
  }
  return undefined;
}
