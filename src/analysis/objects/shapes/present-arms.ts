// The present arms of a published Host descriptor (R3 #13). One reader over the Host closed sum: a union or optional
// descriptor is `facts.sums.sumOf(...)`, and its present arms are the sum arms that are not the absence intrinsic. The
// Host publishes `void` as absence inside a sum (A11) and flattens nested sums, so C# builds no union descriptor and
// applies no void rule of its own. A non-union descriptor is its own present arm; the absence intrinsic has none.
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceTypeDescriptorStructure, type SourceProgramFacts, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";

export function csharpPresentSourceArms(facts: Pick<SourceProgramFacts, "sums">, descriptor: SourceTypeDescriptor,
  site?: Node): readonly SourceTypeDescriptor[] {
  const structure = sourceTypeDescriptorStructure(descriptor);
  if (structure.kind === "intrinsic" && structure.intrinsic === "absence") return Object.freeze([]);
  if (structure.kind !== "union" && structure.kind !== "optional") return Object.freeze([descriptor]);
  const sum = facts.sums.sumOf(structure);
  if (sum === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A published union descriptor must denote a Host closed sum.", site);
  return Object.freeze(sum.arms.filter(arm => !(arm.type.kind === "intrinsic" && arm.type.intrinsic === "absence"))
    .map(arm => arm.type));
}

/** The one present arm of a published descriptor, or undefined when it has several present arms or none. */
export function csharpSinglePresentSourceArm(facts: Pick<SourceProgramFacts, "sums">, descriptor: SourceTypeDescriptor,
  site?: Node): SourceTypeDescriptor | undefined {
  const arms = csharpPresentSourceArms(facts, descriptor, site);
  return arms.length === 1 ? arms[0] : undefined;
}
