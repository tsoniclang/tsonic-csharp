import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  mapCsharpJsConsoleCheckedCall,
} from "../console.js";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  getSourceLibraryMember,
} from "../source-library.js";
import type {
  SourceLibraryMember,
} from "../source-library.js";
import {
  rejectUnmappedCsharpJsSourceLibraryCall,
  rejectUnsupportedCsharpJsSourceLibraryCall,
} from "../unsupported.js";
import {
  sourceLibraryCallReceiverHasClosedFacts,
} from "./closed-facts.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
} from "./helpers.js";
import {
  rejectSourceLibraryCallMissingSelectedSignature,
  rejectSourceLibraryCallWithoutClosedFacts,
  rejectSourceLibraryCallWithoutUniqueTargetMember,
} from "./diagnostics.js";
import {
  getSourceLibraryCallMembers,
} from "./members.js";
import {
  acceptSourceLibraryCheckedCall,
} from "./operations.js";
import {
  getPrevalidatedSourceLibraryCallMember,
  sourceLibraryCallSelectionOptions,
} from "./selection.js";

export function mapCsharpSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" } = {},
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, context);
  if (sourceMember === undefined) {
    return undefined;
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryCall(sourceMember, host);
  if (unsupported !== undefined) {
    return unsupported;
  }
  const consoleCall = mapCsharpJsConsoleCheckedCall(request, context, sourceMember, host);
  if (consoleCall !== undefined) {
    return consoleCall;
  }
  const candidates = getSourceLibraryCallMembers(sourceMember, request, context, host);
  if (candidates.length === 0) {
    return rejectUnmappedCsharpJsSourceLibraryCall(sourceMember, host);
  }
  const prevalidatedMember = getPrevalidatedSourceLibraryCallMember(sourceMember, candidates, request, context, host);
  if (sourceMember.declaringName === "Date" && prevalidatedMember === undefined) {
    return undefined;
  }
  if (!sourceLibraryCallReceiverHasClosedFacts(request, context, sourceMember, host)) {
    if (sourceLibraryCallCanWaitForFinalizedFacts(request, context, sourceMember, host, options.phase)) {
      return undefined;
    }
    return rejectSourceLibraryCallWithoutClosedFacts(sourceMember, host);
  }
  const canWaitForFinalizedFacts = sourceLibraryCallCanWaitForFinalizedFacts(request, context, sourceMember, host, options.phase);
  const jsonStringifyMayNeedFinalFacts = options.phase !== "finalization" &&
    sourceMember.declaringName === "JSON" &&
    sourceMember.memberName === "stringify";
  if (candidates.length > 1 && request.sourceSelectedSignature === undefined && prevalidatedMember === undefined) {
    if (canWaitForFinalizedFacts || jsonStringifyMayNeedFinalFacts) {
      return undefined;
    }
    return rejectSourceLibraryCallMissingSelectedSignature(sourceMember, host);
  }
  const member = prevalidatedMember ??
    host.selectTargetMember(candidates, {
      arguments: request.arguments,
      receiver: request.calleeReceiver,
  }, context, sourceLibraryCallSelectionOptions(request, context, sourceMember, host));
  if (member === undefined) {
    if (canWaitForFinalizedFacts || jsonStringifyMayNeedFinalFacts) {
      return undefined;
    }
    return rejectSourceLibraryCallWithoutUniqueTargetMember(sourceMember, host);
  }
  return acceptSourceLibraryCheckedCall(request, sourceMember, member, context);
}

function sourceLibraryCallCanWaitForFinalizedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization" | undefined,
): boolean {
  if (sourceMember.declaringName === "Object") {
    return (phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context))) &&
      sourceLibraryObjectCallCanWaitForFinalizedFacts(sourceMember);
  }
  if (phase === "finalization" || sourceMember.declaringName !== "JSON" || sourceMember.memberName !== "stringify") {
    return false;
  }
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return request.arguments.some((argument, index) => {
    const argumentType = argumentTypes[index];
    return context.facts.get(argument, runtimeCarrierFactKey) === undefined &&
      (argumentType === undefined || targetTypeIsOpaqueAny(argumentType));
  });
}

function compilerContextCanRunLifecycleFinalization(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return typeof (context.compiler as { readonly getSourceFiles?: unknown } | undefined)?.getSourceFiles === "function";
}

function sourceLibraryObjectCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceMember.memberName === "keys" ||
    sourceMember.memberName === "values" ||
    sourceMember.memberName === "entries" ||
    sourceMember.memberName === "hasOwn" ||
    sourceMember.memberName === "assign";
}

function targetTypeIsOpaqueAny(type: TargetTypeRef): boolean {
  return type.kind === "opaque" && type.id === "any";
}
