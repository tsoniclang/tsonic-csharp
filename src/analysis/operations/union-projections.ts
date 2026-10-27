import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export function admitCsharpUnionProjections(nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  definitions: CsharpTypeDefinitions): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  for (const node of nodes) {
    const fact = operations.selectedProperty.get(node)?.selection;
    if (fact?.kind !== "union-property") continue;
    const reject = (message: string, code = "CSHARP_UNION_PROJECTION_CONTRACT_INVALID"): void => {
      issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message });
    };
    const variants = getCsharpRuntimeUnionArms(fact.unionCarrier, definitions);
    if (!Array.isArray(fact.variants) || !Array.isArray(fact.selectedVariantIndexes)) {
      reject("Native union projection has no exact emitted shape and nonempty selected-variant set."); continue;
    }
    const selected = new Set(fact.selectedVariantIndexes);
    if (variants === undefined || variants.length !== fact.variants.length || selected.size === 0 ||
      selected.size !== fact.selectedVariantIndexes.length || [...selected].some(index => !Number.isInteger(index) || index < 0 || index >= fact.variants.length)) {
      reject("Native union projection has no exact emitted shape and nonempty selected-variant set."); continue;
    }
    for (const [index, variant] of fact.variants.entries()) {
      if (variant === undefined || variant.carrier === undefined) {
        reject("Native union projection conflicts with its finalized variant contract."); break;
      }
      const operation = variant.operation;
      if (variants[index] === undefined || !targetTypeRefEquals(variant.carrier, variants[index]!) || selected.has(index) !== (operation !== undefined)) {
        reject("Native union projection conflicts with its finalized variant contract."); break;
      }
      if (operation === undefined) continue;
      const member = operation.targetMember;
      if (operation.receiver.kind !== "instance" || operation.invocation.kind !== "member" || member.static === true ||
        (member.kind !== "property" && member.kind !== "field") || member.declaringType === undefined || member.returnType === undefined ||
        !targetTypeRefEquals(member.declaringType, variant.carrier) || !targetTypeRefEquals(member.returnType, fact.resultCarrier)) {
        reject("Native union property arm conflicts with its exact receiver or result contract.", "CSHARP_UNION_PROPERTY_ARM_INVALID"); break;
      }
    }
  }
  return Object.freeze(issues);
}
