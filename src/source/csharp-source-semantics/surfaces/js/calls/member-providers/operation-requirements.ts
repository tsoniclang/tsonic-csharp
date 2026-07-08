import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "../../source-library.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  asNodeSubject,
} from "../../../../ast-utils.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
} from "../helpers.js";
import type {
  JsSurfaceArgumentCondition,
  JsSurfaceArgumentTargetCondition,
  JsSurfaceClosedFactsRequirement,
  JsSurfaceOperationRow,
  JsSurfaceReceiverTargetCondition,
} from "./operation-types.js";
import {
  jsSurfaceArgumentMatchesTargetFeature,
  jsSurfaceReceiverMatchesTargetFeature,
} from "./target-features.js";

export type JsSurfaceClosedFactsStatus =
  | { readonly kind: "satisfied" }
  | {
    readonly kind: "missing";
    readonly reason: "receiver" | "argument";
    readonly argumentIndex?: number;
  }
  | { readonly kind: "conflict" };

export function operationRowClosedFactsStatus(
  row: JsSurfaceOperationRow,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): JsSurfaceClosedFactsStatus {
  return row.closedFacts === undefined
    ? { kind: "satisfied" }
    : closedFactsRequirementStatus(row.closedFacts, selectedIdentity, request, context, host);
}

function closedFactsRequirementStatus(
  requirement: JsSurfaceClosedFactsRequirement,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): JsSurfaceClosedFactsStatus {
  switch (requirement.kind) {
    case "all": {
      let hasMissing = false;
      for (const innerRequirement of requirement.requirements) {
        const status = closedFactsRequirementStatus(innerRequirement, selectedIdentity, request, context, host);
        if (status.kind === "conflict") {
          return status;
        }
        if (status.kind === "missing") {
          hasMissing = true;
        }
      }
      return hasMissing ? { kind: "missing", reason: "receiver" } : { kind: "satisfied" };
    }
    case "receiver": {
      const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
      if (receiverTypes.length === 0) {
        return { kind: "missing", reason: "receiver" };
      }
      return receiverTypes.some((receiverType) => receiverMatchesTargetCondition(receiverType, requirement.target, selectedIdentity, request, context, host))
        ? { kind: "satisfied" }
        : { kind: "conflict" };
    }
    case "arguments":
      return argumentConditionsStatus(requirement.conditions, request, context, host);
    case "known-argument-targets": {
      const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
      const missingIndex = argumentTypes.findIndex((argumentType) => argumentType === undefined);
      return missingIndex < 0
        ? { kind: "satisfied" }
        : { kind: "missing", reason: "argument", argumentIndex: missingIndex };
    }
  }
}

function argumentConditionsStatus(
  conditions: readonly JsSurfaceArgumentCondition[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): JsSurfaceClosedFactsStatus {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  let missingArgumentIndex: number | undefined;
  for (const condition of conditions) {
    if ("index" in condition) {
      const argumentType = argumentTypes[condition.index];
      if (argumentType === undefined) {
        if (argumentConditionAllowsMissingArgument(condition, request.arguments[condition.index], context)) {
          continue;
        }
        missingArgumentIndex ??= condition.index;
        continue;
      }
      if (!argumentMatchesTargetCondition(argumentType, condition.target, host)) {
        return { kind: "conflict" };
      }
      continue;
    }
    for (let currentIndex = condition.fromIndex; currentIndex < argumentTypes.length; currentIndex += 1) {
      const argumentType = argumentTypes[currentIndex];
      if (argumentType === undefined) {
        if (argumentConditionAllowsMissingArgument(condition, request.arguments[currentIndex], context)) {
          continue;
        }
        missingArgumentIndex ??= currentIndex;
        continue;
      }
      if (!argumentMatchesTargetCondition(argumentType, condition.target, host)) {
        return { kind: "conflict" };
      }
    }
  }
  return missingArgumentIndex === undefined
    ? { kind: "satisfied" }
    : { kind: "missing", reason: "argument", argumentIndex: missingArgumentIndex };
}

function receiverMatchesTargetCondition(
  receiverType: TargetTypeRef | undefined,
  condition: JsSurfaceReceiverTargetCondition,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  return jsSurfaceReceiverMatchesTargetFeature(condition, {
    receiverType,
    selectedIdentity,
    request,
    context,
    host,
  }) === true;
}

function argumentMatchesTargetCondition(
  argumentType: TargetTypeRef | undefined,
  condition: JsSurfaceArgumentTargetCondition,
  host: CsharpJsSurfaceHost,
): boolean {
  return jsSurfaceArgumentMatchesTargetFeature(condition, {
    argumentType,
    host,
  });
}

function argumentConditionAllowsMissingArgument(
  condition: JsSurfaceArgumentCondition,
  argument: CheckedCallMappingRequest["arguments"][number] | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return condition.allowNullish === true && argumentHasNullishSourceType(argument, context);
}

function argumentHasNullishSourceType(
  argument: CheckedCallMappingRequest["arguments"][number] | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  const node = asNodeSubject(argument);
  const compiler = context.compiler;
  if (node === undefined || compiler === undefined) {
    return false;
  }
  const sourceFile = compiler.ast.getSourceFile(node);
  const type = compiler.checker.getTypeAtLocation(node, { sourceFile });
  return type === undefined ? false : compiler.typeShape.isNullish(type);
}
