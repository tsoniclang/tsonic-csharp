import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../../source-library.js";
import {
  sourceLibraryMemberMatches,
} from "../../source-library.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
} from "../helpers.js";
import {
  arrayConstructorIdentityPolicy,
  collectionOrPrimitiveCallCanWaitForFinalizedFactsPolicy,
  finalFactsSensitiveCallPolicy,
  jsonStringifySourceMemberPolicy,
  objectCallCanWaitForFinalizedFactsPolicy,
  objectIdentityPolicy,
} from "./identity-policies.js";
import {
  targetTypeIsOpaqueAny,
} from "./target-type-support.js";

export function csharpJsSourceLibraryCallMayNeedFinalFacts(
  sourceMember: SourceLibraryMember,
  phase: "checking" | "finalization" | undefined,
): boolean {
  return phase !== "finalization" && sourceLibraryMemberMatches(sourceMember, finalFactsSensitiveCallPolicy);
}

export function csharpJsSourceLibraryCallCanWaitForFinalizedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization" | undefined,
): boolean {
  if ((phase === "checking" || phase === undefined) && compilerContextCanRunLifecycleFinalization(context)) {
    return true;
  }
  if (sourceLibraryMemberMatches(sourceMember, objectIdentityPolicy)) {
    return (phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context))) &&
      sourceLibraryObjectCallCanWaitForFinalizedFacts(sourceMember);
  }
  if (sourceLibraryCollectionOrPrimitiveCallCanWaitForFinalizedFacts(sourceMember)) {
    return phase !== "finalization" && compilerContextCanRunLifecycleFinalization(context);
  }
  if (sourceLibraryMemberMatches(sourceMember, arrayConstructorIdentityPolicy)) {
    return phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context));
  }
  if (
    phase === "finalization" ||
    !compilerContextCanRunLifecycleFinalization(context) ||
    !sourceLibraryMemberMatches(sourceMember, jsonStringifySourceMemberPolicy)
  ) {
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
  return context.host !== undefined;
}

function sourceLibraryObjectCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceLibraryMemberMatches(sourceMember, objectCallCanWaitForFinalizedFactsPolicy);
}

function sourceLibraryCollectionOrPrimitiveCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceLibraryMemberMatches(sourceMember, collectionOrPrimitiveCallCanWaitForFinalizedFactsPolicy);
}
