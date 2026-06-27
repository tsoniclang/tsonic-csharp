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
} from "../../target-member-metadata.js";
import {
  jsSurfaceOperationRows,
} from "./operation-rows.js";
import {
  operationTargetProviderHasCallableMember,
  targetMembersFromOperationTargetProvider,
} from "./operation-providers.js";
import type {
  JsSurfaceCallCallableProviderRequest,
  JsSurfaceCallTargetProviderRequest,
  JsSurfaceOperationRow,
  JsSurfaceOperationTargetProvider,
  JsSurfaceUnsupportedOperation,
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
      selectedIdentity: jsSurfaceSelectedSourceIdentityForMember(sourceMember),
    });
}

export function getCsharpJsSourceLibraryUnsupportedOperation(
  sourceMember: SourceLibraryMember,
): JsSurfaceUnsupportedOperation | undefined {
  const row = sourceCallMetadataRowForSourceMember(sourceMember);
  return row?.policyKind === "unsupported"
    ? row.unsupported ?? defaultUnsupportedOperation
    : undefined;
}

export function getCsharpJsSourceLibraryOperationRow(
  sourceMember: SourceLibraryMember,
): JsSurfaceOperationRow | undefined {
  return sourceCallMetadataRowForSourceMember(sourceMember);
}

function sourceCallMetadataRowForSourceMember(sourceMember: SourceLibraryMember): JsSurfaceOperationRow | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(
    jsSurfaceOperationRows,
    jsSurfaceSelectedSourceIdentityForMember(sourceMember),
  );
}

function callMembersFromOperationRow(
  row: JsSurfaceOperationRow,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const providerRequest = { selectedIdentity, request, context, host } satisfies JsSurfaceCallTargetProviderRequest;
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
    case "runtime-helper":
    case "semantic-exception":
      return (row.targetProviders ?? []).some((provider) => providerHasCallableMember(provider, request));
  }
}

function targetMembersFromProvider(
  provider: JsSurfaceOperationTargetProvider,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  return targetMembersFromOperationTargetProvider(provider, request);
}

function providerHasCallableMember(
  provider: JsSurfaceOperationTargetProvider,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  return operationTargetProviderHasCallableMember(provider, request);
}

const defaultUnsupportedOperation = {
  reason: "The selected JS surface operation has no closed provider/runtime target operation metadata.",
  requiredFacts: [
    "selected JS source declaration/signature identity",
    "surface target operation metadata",
    "surface runtime artifact metadata",
  ],
  capabilityId: "diagnostic.unsupported-selected-surface-operation",
} satisfies JsSurfaceUnsupportedOperation;
