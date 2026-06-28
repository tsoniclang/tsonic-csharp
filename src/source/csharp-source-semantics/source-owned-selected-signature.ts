import type {
  ExtensionFactSubject,
  SelectedTargetSignatureFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "./target-types.js";

const csharpSourceOwnedCallMemberId = "tsonic.csharp.source-owned-call";

export function csharpSourceOwnedSelectedSignatureFact(
  options: {
    readonly sourceSignature?: ExtensionFactSubject;
    readonly sourceDeclaration?: ExtensionFactSubject;
    readonly returnType?: TargetTypeRef;
  },
): SelectedTargetSignatureFact {
  return {
    member: csharpSourceOwnedCallMember(options.returnType),
    ...(options.sourceSignature === undefined ? {} : { sourceSignature: options.sourceSignature }),
    ...(options.sourceDeclaration === undefined ? {} : { sourceDeclaration: options.sourceDeclaration }),
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

function csharpSourceOwnedCallMember(returnType: TargetTypeRef | undefined): CsharpTargetMember {
  return {
    id: csharpSourceOwnedCallMemberId,
    sourceName: "<source-owned-call>",
    targetName: "<source-owned-call>",
    kind: "method",
    static: false,
    parameters: [],
    ...(returnType === undefined ? {} : { returnType }),
    csharpSourceOwnedCall: true,
  };
}
