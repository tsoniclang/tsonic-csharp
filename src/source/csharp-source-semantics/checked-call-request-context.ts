import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";

export interface CsharpCheckedCallRequestContext {
  readonly calleeReceiver?: ExtensionFactSubject;
  readonly calleeReceiverType?: ExtensionFactSubject;
  readonly calleeReceiverTypeSymbol?: ExtensionFactSubject;
  readonly calleePropertyName?: string;
  readonly calleeSelectedPropertySymbol?: ExtensionFactSubject;
  readonly calleeSelectedPropertyDeclaration?: ExtensionFactSubject;
  readonly calleeSymbol?: ExtensionFactSubject;
}

export function getCsharpCheckedCallRequestContext(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): CsharpCheckedCallRequestContext {
  const selectedDeclaration = request.sourceCallee.selectedDeclaration;
  const providerDeclaration = selectedDeclaration === undefined
    ? undefined
    : context.facts.get(selectedDeclaration, providerVirtualDeclarationFactKey) ??
      context.factResolver.resolve(selectedDeclaration, providerVirtualDeclarationFactKey);
  return {
    ...(request.sourceReceiver === undefined ? {} : {
      calleeReceiver: request.sourceReceiver.expression,
      calleeReceiverType: request.sourceReceiver.type,
      ...(request.sourceReceiver.selectedSymbol !== undefined
        ? { calleeReceiverTypeSymbol: request.sourceReceiver.selectedSymbol }
        : request.sourceReceiver.symbol !== undefined
          ? { calleeReceiverTypeSymbol: request.sourceReceiver.symbol }
          : {}),
    }),
    ...(providerDeclaration?.memberName !== undefined
      ? { calleePropertyName: providerDeclaration.memberName }
      : {}),
    ...(request.sourceCallee.selectedSymbol !== undefined
      ? { calleeSelectedPropertySymbol: request.sourceCallee.selectedSymbol }
      : {}),
    ...(selectedDeclaration !== undefined
      ? { calleeSelectedPropertyDeclaration: selectedDeclaration }
      : {}),
    ...(request.sourceCallee.symbol !== undefined
      ? { calleeSymbol: request.sourceCallee.symbol }
      : {}),
  };
}

export function getCsharpCheckedCallCalleeReceiver(
  request: Pick<CheckedCallMappingRequest, "sourceReceiver">,
): ExtensionFactSubject | undefined {
  return request.sourceReceiver?.expression;
}

export function checkedCallIsConstruction(
  request: Pick<CheckedCallMappingRequest, "callKind">,
): boolean {
  return request.callKind === "construct";
}
