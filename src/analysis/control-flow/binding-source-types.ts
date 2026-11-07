import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramFacts, SourceTypeDescriptor } from "@tsonic/target-api/source";

/** The published value type of the declaration, parameter or binding element that owns a binding pattern. */
export function resolveCsharpBindingSourceType(
  pattern: Node,
  ast: AstReader,
  facts: SourceProgramFacts,
): SourceTypeDescriptor | undefined {
  const owner = ast.parent(pattern);
  const outcome = owner === undefined ? undefined : facts.values.type(owner);
  return outcome === undefined || outcome.kind === "refused" ? undefined : outcome.type;
}
