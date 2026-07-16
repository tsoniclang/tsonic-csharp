import type {
  SelectedTargetSignatureFact,
  TargetParameter,
  TargetSignatureSelection,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "./target-types.js";

const csharpSourceOwnedCallMemberId = "tsonic.csharp.source-owned-call";

export function csharpSourceOwnedTargetSignatureSelection(
  options: {
    readonly parameters?: readonly TargetParameter[];
    readonly targetTypeArguments?: readonly TargetTypeRef[];
    readonly returnType?: TargetTypeRef;
  },
): TargetSignatureSelection {
  return {
    member: csharpSourceOwnedCallMember(options.parameters ?? [], options.returnType),
    ...(options.targetTypeArguments === undefined ? {} : { targetTypeArguments: options.targetTypeArguments }),
  };
}

export function isCsharpSourceOwnedSelectedSignature(
  fact: SelectedTargetSignatureFact | undefined,
): boolean {
  return csharpSourceOwnedSelectedMember(fact?.member) !== undefined;
}

export function csharpSourceOwnedSelectedMember(
  member: SelectedTargetSignatureFact["member"] | undefined,
): CsharpTargetMember | undefined {
  const csharpMember = member as CsharpTargetMember | undefined;
  return csharpMember?.csharpSourceOwnedCall === true && csharpMember.id === csharpSourceOwnedCallMemberId
    ? csharpMember
    : undefined;
}

function csharpSourceOwnedCallMember(
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef | undefined,
): CsharpTargetMember {
  return {
    id: csharpSourceOwnedCallMemberId,
    sourceName: "<source-owned-call>",
    targetName: "<source-owned-call>",
    kind: "method",
    static: false,
    parameters,
    ...(returnType === undefined ? {} : { returnType }),
    csharpSourceOwnedCall: true,
  };
}
