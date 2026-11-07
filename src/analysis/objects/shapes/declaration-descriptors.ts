// The Source type of a project class / interface / struct declaration, read from the Host (R3 #17, I6). C# builds no
// descriptor for it: the Host publishes the declaration's own (instance) type as `values.type(declaration)`, with its
// definition, so `objects.members` of it yields the members and their Host origins.
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceProgramFacts, SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";

/** The Host type of a project type declaration. A refusal here is a Host refusal reached after forwarding (I4). */
export function csharpProjectDeclarationType(facts: Pick<SourceProgramFacts, "values">, declaration: Node): SourceTypeDescriptor {
  const outcome = facts.values.type(declaration);
  if (outcome.kind === "refused") failTargetAnalysisInvariant("tsonic-csharp",
    `The Host refused the type of a project type declaration (${outcome.code}); Host refusals are forwarded before C# analysis.`,
    declaration);
  return outcome.type;
}
