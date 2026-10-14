import type { Node } from "@tsonic/tsts";
import { targetUseSiteRef, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { csharpTargetRepresentationContractId } from "../../../target-model/identities/identities.js";
import type { CsharpNativeUseContext, CsharpNativeUseSlot } from "../../../target-model/records/native-demand.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";

export function csharpNativeUseSite(
  owner: Node,
  slot: CsharpNativeUseSlot,
  context: CsharpNativeUseContext = {},
): TargetUseSiteRef {
  return targetUseSiteRef(
    owner,
    csharpNativeUseRole(slot),
    csharpTargetRepresentationContractId,
    context.target === undefined ? undefined : targetTypeRefKey(context.target),
  );
}

function csharpNativeUseRole(slot: CsharpNativeUseSlot): string {
  switch (slot.kind) {
    case "operand":
      return `operand:${slot.position}`;
    case "branch":
      return `branch:${slot.branch}`;
    case "argument":
      return `argument:source=${slot.sourceIndex}:effective=${slot.effectiveIndex}` +
        (slot.parameterIndex === undefined ? "" : `:parameter=${slot.parameterIndex}`);
    case "base-argument":
      return `base-argument:source=${slot.sourceIndex}`;
    case "element":
    case "member":
    case "span":
    case "case":
      return `${slot.kind}:${slot.index}`;
    case "intrinsic-operand":
      return `intrinsic-operand:${slot.operand}` + (slot.index === undefined ? "" : `:${slot.index}`);
    default:
      return slot.kind;
  }
}
