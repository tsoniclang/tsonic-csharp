import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceSelectedSourceIdentityForMember,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  jsSurfacePropertyRows,
} from "./target-member-resolvers.js";
import type {
  CsharpJsSourceLibraryPropertyPrecheck,
  JsSurfacePropertyPrecheck,
  JsSurfacePropertyRow,
  JsSurfacePropertyTargetProvider,
  JsSurfacePropertyTargetProviderRequest,
} from "./types.js";

export function getCsharpJsSourceLibraryPropertyMember(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  const row = propertyRowForSourceMember(sourceMember);
  return row === undefined
    ? undefined
    : singlePropertyMember(propertyMembersFromRow(row, { selectedIdentity, receiverType }));
}

export function csharpJsSourceLibraryPropertyPrecheck(sourceMember: SourceLibraryMember): CsharpJsSourceLibraryPropertyPrecheck {
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  const row = propertyRowForSourceMember(sourceMember);
  return row?.precheck === undefined
    ? "continue"
    : propertyPrecheckResult(row.precheck, { selectedIdentity });
}

function propertyRowForSourceMember(sourceMember: SourceLibraryMember): JsSurfacePropertyRow | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(
    jsSurfacePropertyRows,
    jsSurfaceSelectedSourceIdentityForMember(sourceMember),
  );
}

function propertyPrecheckResult(
  precheck: JsSurfacePropertyPrecheck,
  request: Omit<JsSurfacePropertyTargetProviderRequest, "receiverType">,
): CsharpJsSourceLibraryPropertyPrecheck {
  if (typeof precheck === "string") {
    return precheck;
  }
  const members = targetMembersFromProvider(precheck.targetProvider, request);
  return members.length > 0 ? "defer" : "reject-unmapped";
}

function singlePropertyMember(members: readonly TargetMember[]): TargetMember | undefined {
  return members.length === 1 ? members[0] : undefined;
}

function propertyMembersFromRow(
  row: JsSurfacePropertyRow,
  request: JsSurfacePropertyTargetProviderRequest,
): readonly TargetMember[] {
  return (row.targetProviders ?? []).flatMap((provider) => targetMembersFromProvider(provider, request));
}

function targetMembersFromProvider(
  provider: JsSurfacePropertyTargetProvider,
  request: JsSurfacePropertyTargetProviderRequest,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity);
    case "contextual-metadata":
    case "semantic-exception":
      return provider.resolver.selectTargetMembers(request);
  }
}
