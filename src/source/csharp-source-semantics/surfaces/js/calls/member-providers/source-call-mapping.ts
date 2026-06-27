import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
  arrayTargetMembersForSourceMember,
} from "../../arrays.js";
import {
  booleanTargetMemberIdentityIndex,
} from "../../booleans.js";
import {
  consoleTargetMembersBySourceIdentity,
} from "../../console.js";
import {
  collectionTargetMembersForSourceMember,
} from "../../collections.js";
import {
  dateTargetMembersForSourceMember,
} from "../../date/index.js";
import {
  jsonTargetMemberIdentityIndex,
} from "../../json.js";
import {
  mathTargetMemberIdentityIndex,
} from "../../math.js";
import {
  numberTargetMemberIdentityIndex,
} from "../../numbers.js";
import {
  objectTargetMemberIdentityIndex,
} from "../../objects.js";
import {
  regExpTargetMemberIdentityIndex,
} from "../../regexp/index.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberKey,
} from "../../source-library.js";
import {
  type JsSurfaceSelectedSourceIdentity,
  type JsSurfaceSourceIdentitySelector,
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceSelectedSourceIdentityForMember,
  jsSurfaceSourceIdentityMatchesSelector,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  stringTargetMemberIdentityIndex,
} from "../../strings.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverElementType,
  getSourceLibraryCallReceiverTargetTypes,
  getSourceLibraryCallResultTargetType,
  isNewExpression,
} from "../helpers.js";
import {
  arrayCallableIdentityPolicy,
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
  collectionIdentityPolicy,
} from "./identities.js";
import {
  getObjectPrimitiveReceiverCallMembers,
  getObjectRecordDictionaryCallMembers,
} from "./object-members.js";

interface SourceCallMetadataRow {
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly members?: SourceCallMemberProvider;
  readonly callable?: SourceCallCallablePolicy;
}

type SourceCallMemberProvider =
  {
    readonly membersBySourceIdentity?: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>;
    readonly dateCallConstructMembers?: true;
    readonly objectPrimitiveReceiverMembers?: true;
    readonly objectRecordDictionaryMembers?: true;
    readonly arrayCarrierMembers?: true;
    readonly collectionCarrierMembers?: true;
  };

interface SourceCallCallablePolicy {
  readonly membersExist?: true;
  readonly arrayMembersOrCallSurface?: true;
  readonly collectionMembersExist?: true;
  readonly always?: true;
  readonly never?: true;
}

const sourceCallMetadataRows: readonly SourceCallMetadataRow[] = [
  metadataIndexPolicy({ prefixes: ["Math."] }, mathTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["String."] }, stringTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["Number."] }, numberTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["Boolean."] }, booleanTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["RegExp."] }, regExpTargetMemberIdentityIndex),
  {
    identity: { prefixes: ["Date."] },
    members: { dateCallConstructMembers: true },
    callable: { membersExist: true },
  },
  metadataIndexPolicy({ prefixes: ["JSON."] }, jsonTargetMemberIdentityIndex),
  {
    identity: { prefixes: ["Object."] },
    members: {
      membersBySourceIdentity: objectTargetMemberIdentityIndex,
      objectPrimitiveReceiverMembers: true,
      objectRecordDictionaryMembers: true,
    },
    callable: { membersExist: true },
  },
  {
    identity: { prefixes: ["Array.", "ReadonlyArray."] },
    members: { arrayCarrierMembers: true },
    callable: { arrayMembersOrCallSurface: true },
  },
  {
    identity: collectionIdentityPolicy,
    members: { collectionCarrierMembers: true },
    callable: { collectionMembersExist: true },
  },
  {
    identity: { prefixes: ["Console."] },
    members: { membersBySourceIdentity: consoleTargetMembersBySourceIdentity },
    callable: { membersExist: true },
  },
  {
    identity: { prefixes: ["Promise."] },
    callable: { never: true },
  },
];

export function getCsharpJsSourceLibraryCallMembersFromProviders(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const policy = sourceCallMetadataRowForSourceMember(sourceMember);
  return policy?.members === undefined
    ? []
    : callMembersFromProvider(
        policy.members,
        sourceMember,
        jsSurfaceSelectedSourceIdentityForMember(sourceMember),
        request,
        context,
        host,
      );
}

export function csharpJsSourceLibraryMemberHasCallableProvider(
  sourceMember: SourceLibraryMember,
): boolean {
  const policy = sourceCallMetadataRowForSourceMember(sourceMember);
  return policy?.callable === undefined
    ? false
    : callablePolicyIsSatisfied(
        policy.callable,
        policy.members,
        sourceMember,
        jsSurfaceSelectedSourceIdentityForMember(sourceMember),
      );
}

function sourceCallMetadataRowForSourceMember(sourceMember: SourceLibraryMember): SourceCallMetadataRow | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(
    sourceCallMetadataRows,
    jsSurfaceSelectedSourceIdentityForMember(sourceMember),
  );
}

function callMembersFromProvider(
  provider: SourceCallMemberProvider,
  sourceMember: SourceLibraryMember,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  return [
    ...(provider.membersBySourceIdentity === undefined ? [] : jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, selectedIdentity)),
    ...(provider.dateCallConstructMembers === true
      ? dateTargetMembersForSourceMember(sourceMember, isNewExpression(request.call, context) ? "new" : "call")
      : []),
    ...(provider.objectPrimitiveReceiverMembers === true
      ? getObjectPrimitiveReceiverCallMembers(request, context, host, sourceMember)
      : []),
    ...(provider.objectRecordDictionaryMembers === true
      ? getObjectRecordDictionaryCallMembers(sourceMember, request, context, host)
      : []),
    ...(provider.arrayCarrierMembers === true
      ? arrayMembersFromClosedFacts(sourceMember, request, context, host)
      : []),
    ...(provider.collectionCarrierMembers === true
      ? collectionTargetMembersForSourceMember(
        sourceMember,
        getSourceLibraryCallReceiverTargetTypes(request, context, host)[0],
        jsSurfaceSourceIdentityMatchesSelector(selectedIdentity, collectionConstructorIdentityPolicy)
          ? getSourceLibraryCallResultTargetType(request, context, host)
          : undefined,
      )
      : []),
  ];
}

function callablePolicyIsSatisfied(
  policy: SourceCallCallablePolicy,
  provider: SourceCallMemberProvider | undefined,
  sourceMember: SourceLibraryMember,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): boolean {
  if (policy.never === true) {
    return false;
  }
  if (policy.always === true) {
    return true;
  }
  if (policy.membersExist === true && provider !== undefined && callableMembersFromProvider(provider, sourceMember, selectedIdentity).length > 0) {
    return true;
  }
  if (
    policy.arrayMembersOrCallSurface === true &&
    (arrayTargetMembersForSourceMember(sourceMember).length > 0 ||
      jsSurfaceSourceIdentityMatchesSelector(selectedIdentity, arrayCallableIdentityPolicy))
  ) {
    return true;
  }
  if (policy.collectionMembersExist === true && hasCallableTargetMember(collectionTargetMembersForSourceMember(sourceMember, undefined, undefined))) {
    return true;
  }
  return false;
}

function callableMembersFromProvider(
  provider: SourceCallMemberProvider,
  sourceMember: SourceLibraryMember,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): readonly TargetMember[] {
  const members = [
    ...(provider.membersBySourceIdentity === undefined ? [] : jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, selectedIdentity)),
    ...(provider.dateCallConstructMembers === true ? dateTargetMembersForSourceMember(sourceMember, "call") : []),
  ];
  return members.filter(targetMemberIsCallable);
}

function hasCallableTargetMember(members: readonly TargetMember[]): boolean {
  return members.some(targetMemberIsCallable);
}

function targetMemberIsCallable(member: TargetMember): boolean {
  return member.kind !== "property";
}

function arrayMembersFromClosedFacts(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
  if (
    jsSurfaceSourceIdentityMatchesSelector(jsSurfaceSelectedSourceIdentityForMember(sourceMember), arrayConstructorIdentityPolicy) &&
    resultElementType === undefined
  ) {
    return [];
  }
  return arrayTargetMembersForSourceMember(sourceMember, resultElementType ?? arrayElementTypeFromClosedFacts(request, context, host));
}

function arrayElementTypeFromClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host)) ??
    getSourceLibraryCallReceiverElementType(request, context, host) ??
    getSourceLibraryCallArgumentTargetTypes(request, context, host).map(getCsharpArrayLikeElementType).find((element) => element !== undefined);
}

function metadataIndexPolicy(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): SourceCallMetadataRow {
  return {
    identity,
    members: { membersBySourceIdentity },
    callable: { membersExist: true },
  };
}
