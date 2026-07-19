import {
  deferObservation,
  acceptObservation,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpTargetOperationFromMember,
  resolveSelectedSourceLibraryMemberIdentity,
  recordCsharpTargetOperation,
  sourceLibraryMemberIdentity,
  targetOperation,
  targetOperationFromMember,
} from "./source-library.js";
import {
  csharpJsSourceLibraryMemberHasCallableProvider,
  getCsharpJsSourceLibraryOperationRow,
} from "./calls/member-providers/index.js";
import {
  csharpJsSourceLibraryPropertyAllowsCallableValue,
  csharpJsSourceLibraryPropertyReceiverHasClosedFacts,
  csharpJsSourceLibraryPropertyPrecheck,
  csharpJsSourceLibraryPropertyRequiresFinalCarrierSelection,
  csharpJsSourceLibraryPropertyRequiresSeededReceiverFacts,
  getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity,
} from "./properties/member-providers/index.js";
import {
  rejectUnmappedCsharpJsSourceLibraryPropertyAccess,
  rejectUnsupportedCsharpJsSourceLibraryPropertyAccess,
} from "./unsupported.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "./target-member-metadata.js";
import {
  jsSurfaceSelectedSourceIdentityForMember,
} from "./target-member-metadata.js";
import {
  getCsharpArrayBoundaryCoreCarrierForReference,
} from "./array-boundary-facts.js";
import {
  getRecordedCsharpRuntimeCarrierFact,
} from "../../../csharp-facts.js";
import {
  getSelectedAccessEvidence,
} from "../../selected-source-evidence.js";

export function mapCsharpDirectSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const selectedEvidence = getSelectedAccessEvidence(request);
  const sourceMember = resolveSelectedSourceLibraryMemberIdentity(
    selectedEvidence.selectedDeclaration,
    selectedEvidence.selectedSymbol,
    context,
  );
  return mapCsharpSourceLibraryPropertyOperation(request, context, sourceMember, host);
}

function mapCsharpSourceLibraryPropertyOperation(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  sourceMember: SourceLibraryMember | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (sourceMember === undefined) {
    return undefined;
  }
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  const receiverType = getSourceLibraryPropertyReceiverType(request, context, selectedIdentity, host);
  if (
    sourceLibrarySelectedDeclarationHasCallTarget(
      sourceMember,
      receiverType,
      request.use === "call-callee",
    )
  ) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(
        `tsonic.csharp.js.${sourceLibraryMemberIdentity(sourceMember)}.callee`,
        "method",
        sourceLibraryMemberIdentity(sourceMember),
      ),
    }, [{ message: `C# JS surface callable property accepted from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'. Call expressions record the concrete target member; standalone callable values require finalized callable carrier facts before emission.` }]);
  }
  const precheck = csharpJsSourceLibraryPropertyPrecheck(selectedIdentity);
  if (precheck === "defer") {
    return undefined;
  }
  if (precheck === "reject-unmapped") {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host, request.expression);
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(sourceMember, host, request.expression);
  if (unsupported !== undefined) {
    return unsupported;
  }
  if (sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity) && receiverType === undefined) {
    return deferObservation;
  }
  if (receiverType === undefined && sourceLibraryPropertyRequiresSeededReceiverFacts(selectedIdentity)) {
    return undefined;
  }
  if (!sourceLibraryPropertyReceiverHasClosedFacts(receiverType, selectedIdentity, host)) {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host, request.expression);
  }
  const member = getSourceLibraryPropertyMember(selectedIdentity, receiverType, host);
  if (member === undefined) {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host, request.expression);
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(member), [{ message: `C# JS surface property operation recorded from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
    ...(member.returnType === undefined ? {} : { resultType: member.returnType }),
  }, [{ message: `C# JS surface target property selected from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
}

function sourceLibraryPropertyRequiresSeededReceiverFacts(selectedIdentity: JsSurfaceSelectedSourceIdentity): boolean {
  return csharpJsSourceLibraryPropertyRequiresSeededReceiverFacts(selectedIdentity);
}

function sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity: JsSurfaceSelectedSourceIdentity): boolean {
  return csharpJsSourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity);
}

function sourceLibraryPropertyReceiverHasClosedFacts(
  receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  host: CsharpJsSurfaceHost,
): boolean {
  return csharpJsSourceLibraryPropertyReceiverHasClosedFacts(receiverType, selectedIdentity, host);
}

function getSourceLibraryPropertyReceiverType(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  host: CsharpJsSurfaceHost,
): ReturnType<CsharpJsSurfaceHost["getTargetTypeRefForSubject"]> {
  const requiresFinalCarrier = sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity);
  const subjects = [
    request.sourceReceiver.expression,
    request.sourceReceiver.type,
    request.sourceReceiver.selectedDeclaration,
    request.sourceReceiver.selectedSymbol,
    request.sourceReceiver.declaration,
    request.sourceReceiver.symbol,
  ];
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const targetType = (requiresFinalCarrier
      ? getCsharpArrayBoundaryCoreCarrierForReference(subject, context)
      : undefined) ??
      getRecordedCsharpRuntimeCarrierFact(context.facts, subject)?.carrier ??
      host.getTargetTypeRefForSubject(subject, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      });
    if (targetType !== undefined) {
      return host.unwrapNullableTargetType(targetType);
    }
  }
  return undefined;
}

function getSourceLibraryPropertyMember(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  return getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity(selectedIdentity, receiverType, host);
}

function sourceLibrarySelectedDeclarationHasCallTarget(
  sourceMember: SourceLibraryMember,
  receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>,
  isCallCallee: boolean,
): boolean {
  if (csharpJsSourceLibraryPropertyAllowsCallableValue(jsSurfaceSelectedSourceIdentityForMember(sourceMember))) {
    return true;
  }
  if (isCallCallee && getCsharpJsSourceLibraryOperationRow(sourceMember) !== undefined) {
    return true;
  }
  return isCallCallee &&
    csharpJsSourceLibraryMemberHasCallableProvider(sourceMember, {
      contextualDeclaringType: receiverType,
    });
}
