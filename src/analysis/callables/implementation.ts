// The implementation declaration of a project callable contract (an overload signature, or the implementation itself).
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";

/**
 * The Host's callable implementation of `contract` (`facts.objects.callableImplementation`, R-E2-2). A refusal is
 * collected by the Host in `refusals()` and forwarded before C# analysis, so a refusal here is an invariant failure.
 */
export function csharpCallableImplementation(facts: SourceProgramFacts, contract: Node): Node | "unrelated" {
  const selected = facts.objects.callableImplementation(contract);
  if (selected !== "unrelated" && (selected as { readonly kind?: unknown }).kind === "refused") {
    return failTargetAnalysisInvariant("tsonic-csharp", "A refused callable implementation reached C# analysis " +
      "(the Host collects TSONIC_SOURCE_CALLABLE_IMPLEMENTATION_UNRESOLVED in refusals()).", contract);
  }
  return selected as Node | "unrelated";
}
