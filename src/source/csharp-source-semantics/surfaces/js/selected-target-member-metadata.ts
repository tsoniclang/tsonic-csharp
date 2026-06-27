import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  arrayTargetMembersForSourceMember,
} from "./arrays/target-members/index.js";
import {
  jsonTargetMemberIdentityIndex,
} from "./json.js";
import {
  objectTargetMemberIdentityIndex,
} from "./objects.js";
import type {
  SourceLibraryMember,
  SourceLibraryMemberKey,
} from "./source-library.js";
import {
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceSelectedSourceIdentityForMember,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "./target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
  JsSurfaceSourceIdentitySelector,
} from "./target-member-metadata.js";

export interface JsSurfaceSelectedTargetMemberLookupRequest {
  readonly sourceMember: SourceLibraryMember;
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
  readonly contextualElementType?: TargetTypeRef;
}

interface JsSurfaceSelectedTargetMemberRow {
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly targetProviders: readonly JsSurfaceSelectedTargetMemberProvider[];
}

type JsSurfaceSelectedTargetMemberProvider =
  | {
    readonly kind: "metadata-index";
    readonly membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>;
  }
  | {
    readonly kind: "contextual-metadata";
    readonly resolver: JsSurfaceSelectedTargetMemberProviderResolver;
  };

interface JsSurfaceSelectedTargetMemberProviderResolver {
  readonly id: string;
  readonly selectTargetMembers: (request: JsSurfaceSelectedTargetMemberLookupRequest) => readonly TargetMember[];
}

const jsSurfaceSelectedTargetMemberRows: readonly JsSurfaceSelectedTargetMemberRow[] = [
  selectedTargetMemberRowFromContextualMetadata({ prefixes: ["Array.", "ReadonlyArray."] }, {
    id: "closed-sequence-selected-target-metadata",
    selectTargetMembers: (request) =>
      arrayTargetMembersForSourceMember(request.sourceMember, request.contextualElementType),
  }),
  selectedTargetMemberRowFromMetadataIndex({ prefixes: ["Object."] }, objectTargetMemberIdentityIndex),
  selectedTargetMemberRowFromMetadataIndex({ prefixes: ["JSON."] }, jsonTargetMemberIdentityIndex),
];

export function jsSurfaceSelectedTargetMembersForSourceMember(
  sourceMember: SourceLibraryMember,
  contextualElementType?: TargetTypeRef,
): readonly TargetMember[] {
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  const row = jsSurfaceSelectMetadataRowForSourceIdentity(
    jsSurfaceSelectedTargetMemberRows,
    selectedIdentity,
  );
  return row === undefined
    ? []
    : selectedTargetMembersFromRow(row, { sourceMember, selectedIdentity, contextualElementType });
}

function selectedTargetMemberRowFromMetadataIndex(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): JsSurfaceSelectedTargetMemberRow {
  return {
    identity,
    targetProviders: [{
      kind: "metadata-index",
      membersBySourceIdentity,
    }],
  };
}

function selectedTargetMemberRowFromContextualMetadata(
  identity: JsSurfaceSourceIdentitySelector,
  resolver: JsSurfaceSelectedTargetMemberProviderResolver,
): JsSurfaceSelectedTargetMemberRow {
  return {
    identity,
    targetProviders: [{
      kind: "contextual-metadata",
      resolver,
    }],
  };
}

function selectedTargetMembersFromRow(
  row: JsSurfaceSelectedTargetMemberRow,
  request: JsSurfaceSelectedTargetMemberLookupRequest,
): readonly TargetMember[] {
  return row.targetProviders.flatMap((provider) => selectedTargetMembersFromProvider(provider, request));
}

function selectedTargetMembersFromProvider(
  provider: JsSurfaceSelectedTargetMemberProvider,
  request: JsSurfaceSelectedTargetMemberLookupRequest,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity);
    case "contextual-metadata":
      return provider.resolver.selectTargetMembers(request);
  }
}
