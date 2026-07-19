import {
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperatorMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  SelectedSourceValueEvidence,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
  getRecordedCsharpRuntimeCarrierFact,
} from "../../csharp-facts.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";

export function getCheckedOperatorOperandTargetTypeRefs(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  operandQuery: TargetTypeRefResolutionOptions,
  host: CsharpOperationsProviderHost,
): { readonly left: TargetTypeRef | undefined; readonly right: TargetTypeRef | undefined } {
  if (request.operatorKind !== "binary") {
    return {
      left: getCheckedOperatorOperandTargetTypeRef(
        request.sourceOperand,
        request.operand,
        context,
        operandQuery,
        host,
      ),
      right: undefined,
    };
  }
  return {
    left: getCheckedOperatorOperandTargetTypeRef(
      request.sourceLeft,
      request.left,
      context,
      operandQuery,
      host,
    ),
    right: getCheckedOperatorOperandTargetTypeRef(
      request.sourceRight,
      request.right,
      context,
      operandQuery,
      host,
    ),
  };
}

function getCheckedOperatorOperandTargetTypeRef(
  evidence: SelectedSourceValueEvidence | undefined,
  expressionSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  options: TargetTypeRefResolutionOptions,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  const candidates: readonly (ExtensionFactSubject | undefined)[] = [
    evidence?.expression,
    evidence?.type,
    evidence?.authoredTypeNode,
    expressionSubject,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined) {
      continue;
    }
    const finalized = getFinalizedCheckedOperandTargetTypeRef(candidate, context);
    if (finalized !== undefined) {
      return finalized;
    }
    const mapped = host.getTargetTypeRefForSubject(candidate, context, {
      ...options,
      allowSemanticTypeQuery: false,
    });
    if (mapped !== undefined) {
      return mapped;
    }
  }
  for (const candidate of [
    evidence?.selectedDeclaration,
    evidence?.selectedSymbol,
    evidence?.declaration,
    evidence?.symbol,
  ]) {
    if (candidate === undefined) {
      continue;
    }
    const mapped = host.getTargetTypeRefForSubject(candidate, context, {
      ...options,
      allowRuntimeCarrier: false,
      allowSemanticTypeQuery: false,
    });
    if (mapped !== undefined) {
      return mapped;
    }
  }
  return undefined;
}

function getFinalizedCheckedOperandTargetTypeRef(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
): TargetTypeRef | undefined {
  return context.factResolver.resolve(subject, targetOperationFactKey)?.resultType ??
    context.facts.get(subject, targetOperationFactKey)?.resultType ??
    context.factResolver.resolve(subject, csharpTargetOperationFactKey)?.resultType ??
    context.facts.get(subject, csharpTargetOperationFactKey)?.resultType ??
    getRecordedCsharpRuntimeCarrierFact(context.facts, subject)?.carrier;
}
