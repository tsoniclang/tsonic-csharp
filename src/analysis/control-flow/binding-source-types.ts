import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceEffectiveTypes, SourceTypeDescriptor } from "@tsonic/target-api/source";

export function resolveCsharpBindingSourceType(
  pattern: Node,
  ast: AstReader,
  effectiveTypes: SourceEffectiveTypes,
): SourceTypeDescriptor | undefined {
  const owner = ast.parent(pattern);
  const outcome = owner === undefined ? undefined : effectiveTypes.get(owner);
  return outcome === undefined || outcome.kind === "refused" ? undefined : outcome.type;
}
