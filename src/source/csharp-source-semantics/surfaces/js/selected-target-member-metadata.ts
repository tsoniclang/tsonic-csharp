import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  arrayTargetMembersForSelectedIdentity,
} from "./arrays/target-members/index.js";
import {
  collectionTargetMembersForSelectedIdentity,
} from "./collection-target-metadata/index.js";
import {
  jsonTargetMemberIdentityIndex,
} from "./json.js";
import {
  objectTargetMemberIdentityIndex,
} from "./objects.js";
import type {
  SourceLibraryMemberKey,
} from "./source-library.js";
import {
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "./target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
  JsSurfaceSourceIdentitySelector,
} from "./target-member-metadata.js";

export interface JsSurfaceSelectedTargetMemberLookupRequest {
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
  readonly contextualElementType?: TargetTypeRef;
  readonly contextualDeclaringType?: TargetTypeRef;
  readonly contextualResultType?: TargetTypeRef;
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
    readonly kind: "closed-sequence-metadata";
  }
  | {
    readonly kind: "closed-keyed-collection-metadata";
  };

const jsSurfaceSelectedTargetMemberRows: readonly JsSurfaceSelectedTargetMemberRow[] = [
  selectedTargetMemberRowFromClosedSequenceMetadata({ prefixes: ["Array.", "ReadonlyArray."] }),
  selectedTargetMemberRowFromClosedKeyedCollectionMetadata({ prefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."] }),
  selectedTargetMemberRowFromMetadataIndex({ prefixes: ["Object."] }, objectTargetMemberIdentityIndex),
  selectedTargetMemberRowFromMetadataIndex({ prefixes: ["JSON."] }, jsonTargetMemberIdentityIndex),
];

export function jsSurfaceSelectedTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  options: Omit<JsSurfaceSelectedTargetMemberLookupRequest, "selectedIdentity"> = {},
): readonly TargetMember[] {
  const row = jsSurfaceSelectMetadataRowForSourceIdentity(
    jsSurfaceSelectedTargetMemberRows,
    selectedIdentity,
  );
  return row === undefined
    ? []
    : selectedTargetMembersFromRow(row, { selectedIdentity, ...options });
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

function selectedTargetMemberRowFromClosedSequenceMetadata(
  identity: JsSurfaceSourceIdentitySelector,
): JsSurfaceSelectedTargetMemberRow {
  return {
    identity,
    targetProviders: [{
      kind: "closed-sequence-metadata",
    }],
  };
}

function selectedTargetMemberRowFromClosedKeyedCollectionMetadata(
  identity: JsSurfaceSourceIdentitySelector,
): JsSurfaceSelectedTargetMemberRow {
  return {
    identity,
    targetProviders: [{
      kind: "closed-keyed-collection-metadata",
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
    case "closed-sequence-metadata":
      return arrayTargetMembersForSelectedIdentity(request.selectedIdentity, request.contextualElementType, request.contextualDeclaringType);
    case "closed-keyed-collection-metadata":
      return collectionTargetMembersForSelectedIdentity(request.selectedIdentity, request.contextualDeclaringType, request.contextualResultType);
  }
}
