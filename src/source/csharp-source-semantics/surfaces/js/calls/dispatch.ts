import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  resolveSelectedSourceLibraryMemberIdentity,
  sourceLibraryMemberIdentity,
} from "../source-library.js";
import {
  csharpJsSourceLibraryCallCanWaitForFinalizedFacts,
} from "./closed-facts/index.js";
import {
  rejectUnmappedCsharpJsSourceLibraryCall,
  rejectUnsupportedCsharpJsSourceLibraryCall,
} from "../unsupported.js";
import {
  rejectSourceLibraryCallMissingSelectedSignature,
  rejectSourceLibraryCallWithoutClosedArgumentFacts,
  rejectSourceLibraryCallWithoutClosedFacts,
  rejectSourceLibraryCallWithoutUniqueTargetMember,
} from "./diagnostics.js";
import {
  getSourceLibraryCallMembers,
} from "./members.js";
import {
  getCsharpJsSourceLibraryOperationRow,
  getCsharpJsSourceLibraryUnsupportedOperation,
  operationRowClosedFactsStatus,
} from "./member-providers/index.js";
import {
  acceptDeferredSourceLibraryCheckedCall,
  acceptSourceLibraryCheckedCall,
} from "./operations.js";
import {
  selectSourceLibraryCallMember,
} from "./selection.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
} from "./helpers.js";
import {
  getCsharpCheckedCallRequestContext,
} from "../../../checked-call-request-context.js";

export function mapCsharpSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" } = {},
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const sourceMember = resolveCheckedCallSourceLibraryMember(request, context);
  if (sourceMember === undefined) {
    return undefined;
  }
  if (request.sourceSelectedSignature === undefined) {
    return rejectSourceLibraryCallMissingSelectedSignature(sourceMember, host);
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryCall(
    sourceMember,
    host,
    getCsharpJsSourceLibraryUnsupportedOperation(sourceMember),
    request.call,
  );
  if (unsupported !== undefined) {
    return unsupported;
  }
  const canWaitForFinalizedFacts = csharpJsSourceLibraryCallCanWaitForFinalizedFacts(request, context, sourceMember, host, options.phase);
  const operationRow = getCsharpJsSourceLibraryOperationRow(sourceMember);
  const candidates = getSourceLibraryCallMembers(sourceMember, request, context, host);
  if (candidates.length === 0) {
    return rejectUnmappedCsharpJsSourceLibraryCall(sourceMember, host, request.call);
  }
  const selectedMember = selectSourceLibraryCallMember(candidates, request, context, host, true, sourceLibraryMemberIdentity(sourceMember));
  const closedFactsStatus = operationRow === undefined
    ? { kind: "satisfied" } as const
    : operationRowClosedFactsStatus(operationRow, { key: sourceLibraryMemberIdentity(sourceMember) }, request, context, host);
  if (closedFactsStatus.kind !== "satisfied") {
    if (canWaitForFinalizedFacts) {
      const deferredMember = selectedMember ?? (candidates.length === 1 ? candidates[0] : undefined);
      return deferredMember === undefined
        ? rejectSourceLibraryCallWithoutClosedFacts(sourceMember, host)
        : acceptDeferredSourceLibraryCheckedCall(request, sourceMember, deferredMember, context);
    }
    return closedFactsStatus.kind === "missing" &&
      closedFactsStatus.reason === "argument" &&
      closedFactsStatus.argumentIndex !== undefined
      ? rejectSourceLibraryCallWithoutClosedArgumentFacts(sourceMember, host, closedFactsStatus.argumentIndex)
      : rejectSourceLibraryCallWithoutClosedFacts(sourceMember, host);
  }
  if (selectedMember === undefined && request.sourceSelectedSignature === undefined) {
    if (canWaitForFinalizedFacts) {
      return undefined;
    }
    return rejectSourceLibraryCallMissingSelectedSignature(sourceMember, host);
  }
  const member = selectedMember;
  if (member === undefined) {
    if (targetMemberSelectionRequiresReceiverFacts(candidates, request, context, host)) {
      if (canWaitForFinalizedFacts) {
        return undefined;
      }
      return rejectSourceLibraryCallWithoutClosedFacts(sourceMember, host);
    }
    const missingArgumentFactIndex = getSourceLibraryCallMissingArgumentFactIndex(request, context, host);
    if (missingArgumentFactIndex !== undefined) {
      return rejectSourceLibraryCallWithoutClosedArgumentFacts(sourceMember, host, missingArgumentFactIndex);
    }
    if (canWaitForFinalizedFacts) {
      return undefined;
    }
    return rejectSourceLibraryCallWithoutUniqueTargetMember(sourceMember, host, {
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        parameters: candidate.parameters.map((parameter) => parameter.type),
        returnType: candidate.returnType,
        receiverPassing: candidate.receiverPassing,
      })),
      argumentTypes: getSourceLibraryCallArgumentTargetTypes(request, context, host),
    });
  }
  return acceptSourceLibraryCheckedCall(request, sourceMember, member, context);
}

export function resolveCheckedCallSourceLibraryMember(
  request: Pick<CheckedCallMappingRequest, "sourceSelectedCalleeDeclaration" | "sourceSelectedCalleeSymbol" | "sourceSelectedDeclaration">,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
) {
  return resolveSelectedSourceLibraryMemberIdentity(request.sourceSelectedDeclaration, undefined, context) ??
    resolveSelectedSourceLibraryMemberIdentity(request.sourceSelectedCalleeDeclaration, request.sourceSelectedCalleeSymbol, context);
}

function targetMemberSelectionRequiresReceiverFacts(
  candidates: readonly ReturnType<typeof getSourceLibraryCallMembers>[number][],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  return requestContext.calleeReceiver !== undefined &&
    candidates.some((candidate) => candidate.receiverPassing === "first-argument") &&
    getSourceLibraryCallReceiverTargetTypes(request, context, host).length === 0;
}

function getSourceLibraryCallMissingArgumentFactIndex(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): number | undefined {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  const index = argumentTypes.findIndex((argumentType) => argumentType === undefined);
  return index < 0 ? undefined : index;
}
