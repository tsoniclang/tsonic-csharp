import type {
  SelectedTargetSignatureFact,
  TargetMember,
  TargetParameter,
  TargetSignatureSelection,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetMemberAsSelection,
  targetTypeRefAsSelection,
} from "./target-selection-contract.js";

const csharpSourceOwnedCallMemberId = "tsonic.csharp.source-owned-call";

export function csharpSourceOwnedTargetSignatureSelection(
  options: {
    readonly parameters?: readonly TargetParameter[];
    readonly targetTypeArguments?: readonly TargetTypeRef[];
    readonly returnType?: TargetTypeRef;
  },
): TargetSignatureSelection {
  return {
    member: targetMemberAsSelection(csharpSourceOwnedCallMember(options.parameters ?? [], options.returnType)),
    ...(options.targetTypeArguments === undefined ? {} : {
      targetTypeArguments: options.targetTypeArguments.map(targetTypeRefAsSelection),
    }),
  };
}

export function isCsharpSourceOwnedSelectedSignature(
  fact: SelectedTargetSignatureFact | undefined,
): boolean {
  return csharpSourceOwnedSelectedMember(fact?.member) !== undefined;
}

export function csharpSourceOwnedSelectedMember(
  member: SelectedTargetSignatureFact["member"] | undefined,
): TargetMember | undefined {
  return member?.id === csharpSourceOwnedCallMemberId &&
    member.sourceName === "<source-owned-call>" &&
    member.targetName === "<source-owned-call>"
    ? member
    : undefined;
}

function csharpSourceOwnedCallMember(
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef | undefined,
): TargetMember {
  return {
    id: csharpSourceOwnedCallMemberId,
    sourceName: "<source-owned-call>",
    targetName: "<source-owned-call>",
    kind: "method",
    static: false,
    parameters,
    ...(returnType === undefined ? {} : { returnType }),
  };
}
