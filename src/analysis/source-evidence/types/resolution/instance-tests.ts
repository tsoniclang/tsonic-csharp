import type { Node } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceEffectiveTypes, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

export function resolveCsharpInstanceType(
  effectiveTypes: SourceEffectiveTypes,
  constructor: Node,
  resolveCarrier: (type: SourceTypeDescriptor) => TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  const outcome = effectiveTypes.get(constructor);
  if (outcome === undefined || outcome.kind === "refused") return undefined;
  if (outcome.provenance.occurrence !== constructor) failTargetAnalysisInvariant("tsonic-csharp",
    "A native constructor test requires its identical published Source occurrence.", constructor);
  const structure = sourceTypeDescriptorStructure(outcome.type);
  const signatures = structure.kind === "callable" || structure.kind === "shape" ? structure.constructs : [];
  const instances = signatures.map(signature => signature.result === undefined
    ? undefined : resolveCarrier(signature.result));
  const selected = instances[0];
  return selected !== undefined && instances.every(instance => instance !== undefined && targetTypeRefEquals(selected, instance))
    ? selected : undefined;
}
