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
    readonly typeParameterNames?: readonly string[];
    readonly returnType?: TargetTypeRef;
  },
): TargetSignatureSelection {
  // A selection carrying target type arguments must describe a member with the
  // matching type parameters. Deriving both here keeps the arity consistent by
  // construction rather than leaving it for the contract validator to reject.
  const typeParameterNames = options.targetTypeArguments === undefined
    ? undefined
    : options.typeParameterNames ?? options.targetTypeArguments.map((_, index) => `T${index}`);
  return {
    member: targetMemberAsSelection(csharpSourceOwnedCallMember(
      options.parameters ?? [],
      options.returnType,
      typeParameterNames,
    )),
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
  typeParameterNames: readonly string[] | undefined,
): TargetMember {
  return {
    id: csharpSourceOwnedCallMemberId,
    sourceName: "<source-owned-call>",
    targetName: "<source-owned-call>",
    kind: "method",
    static: false,
    parameters,
    ...(typeParameterNames === undefined || typeParameterNames.length === 0
      ? {}
      : { typeParameters: typeParameterNames.map((name) => ({ name })) }),
    ...(returnType === undefined ? {} : { returnType }),
  };
}
