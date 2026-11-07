// Member contracts and dispatch of project members, read from Host object facts (objects.contracts,
// objects.implementation). A Host refusal is forwarded before C# analysis, so meeting one here is an invariant failure.
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceMemberImplementation, SourceProgramFacts } from "@tsonic/target-api/source";

/** The contract members (base class or interface members) an implementation member implements or overrides. */
export function csharpMemberContracts(facts: SourceProgramFacts, implementation: Node): readonly Node[] {
  const contracts = facts.objects.contracts(implementation);
  return "code" in contracts ? failTargetAnalysisInvariant("tsonic-csharp",
    "Member contracts are a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", implementation) : contracts;
}

/**
 * The dispatch facts of a class member as its own implementation (overridesBase, hasDerivedOverride):
 * objects.implementation(owner class, member). Request R-B1 (D1 notes) may publish this as objects.dispatch.
 */
export function csharpMemberDispatch(facts: SourceProgramFacts, classDeclaration: Node, member: Node): SourceMemberImplementation | undefined {
  const implementation = facts.objects.implementation(classDeclaration, member);
  if (implementation === "unrelated") return undefined;
  return "code" in implementation ? failTargetAnalysisInvariant("tsonic-csharp",
    "Member dispatch is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", member) : implementation;
}
