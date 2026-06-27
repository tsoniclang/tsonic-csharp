import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../../source-library.js";
import {
  type JsSurfaceSelectedSourceIdentity,
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceSelectedSourceIdentityForMember,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  jsSurfaceOperationRows,
} from "./operation-rows.js";
import type {
  JsSurfaceCallCallableProviderRequest,
  JsSurfaceCallTargetProviderRequest,
  JsSurfaceOperationRow,
  JsSurfaceOperationTargetProvider,
} from "./operation-types.js";
import {
  jsSurfaceTargetMemberIsCallable,
} from "./operation-types.js";

export function getCsharpJsSourceLibraryCallMembersFromProviders(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const row = sourceCallMetadataRowForSourceMember(sourceMember);
  return row === undefined || row.policyKind === "unsupported"
    ? []
    : callMembersFromOperationRow(
        row,
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
  const row = sourceCallMetadataRowForSourceMember(sourceMember);
  return row === undefined
    ? false
    : operationRowHasCallableProvider(row, {
      sourceMember,
      selectedIdentity: jsSurfaceSelectedSourceIdentityForMember(sourceMember),
    });
}

function sourceCallMetadataRowForSourceMember(sourceMember: SourceLibraryMember): JsSurfaceOperationRow | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(
    jsSurfaceOperationRows,
    jsSurfaceSelectedSourceIdentityForMember(sourceMember),
  );
}

function callMembersFromOperationRow(
  row: JsSurfaceOperationRow,
  sourceMember: SourceLibraryMember,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const providerRequest = { sourceMember, selectedIdentity, request, context, host } satisfies JsSurfaceCallTargetProviderRequest;
  return (row.targetProviders ?? []).flatMap((provider) => targetMembersFromProvider(provider, providerRequest));
}

function operationRowHasCallableProvider(
  row: JsSurfaceOperationRow,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  if (row.callableWithoutContext === true) {
    return true;
  }
  switch (row.policyKind) {
    case "unsupported":
      return false;
    case "provider-member":
    case "carrier-member":
    case "semantic-exception":
      return (row.targetProviders ?? []).some((provider) => providerHasCallableMember(provider, request));
  }
}

function targetMembersFromProvider(
  provider: JsSurfaceOperationTargetProvider,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity);
    case "operation-adapter":
      return provider.adapter.selectTargetMembers(request);
  }
}

function providerHasCallableMember(
  provider: JsSurfaceOperationTargetProvider,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity).some(jsSurfaceTargetMemberIsCallable);
    case "operation-adapter":
      return provider.adapter.hasCallableProvider(request);
  }
}
