import type {
  CheckedElementAccessMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeParent,
} from "./ast-utils.js";
export interface CsharpCheckedSelectedMemberContext {
  readonly sourceSelectedSymbol?: ExtensionFactSubject;
  readonly sourceSelectedDeclaration?: ExtensionFactSubject;
  readonly sourceSelectedDeclarationContainer?: ExtensionFactSubject;
}

export type CsharpCheckedPropertyAccessRequestContext = CsharpCheckedSelectedMemberContext;

export type CsharpCheckedElementAccessRequestContext = CsharpCheckedSelectedMemberContext;

export function getCsharpCheckedPropertyAccessRequestContext(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): CsharpCheckedPropertyAccessRequestContext {
  return getCsharpCheckedMemberAccessRequestContext(request.receiver, request.sourceSelectedSymbol, request.sourceSelectedDeclaration, context);
}

export function getCsharpCheckedElementAccessRequestContext(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): CsharpCheckedElementAccessRequestContext {
  return getCsharpCheckedMemberAccessRequestContext(request.receiver, request.sourceSelectedSymbol, request.sourceSelectedDeclaration, context);
}

function getCsharpCheckedMemberAccessRequestContext(
  _receiverSubject: ExtensionFactSubject,
  selectedSymbol: ExtensionFactSubject | undefined,
  selectedDeclaration: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpCheckedSelectedMemberContext {
  return {
    ...(selectedSymbol !== undefined ? { sourceSelectedSymbol: selectedSymbol } : {}),
    ...(selectedDeclaration !== undefined ? { sourceSelectedDeclaration: selectedDeclaration } : {}),
    ...selectedMemberContext(selectedDeclaration, context.compiler?.ast),
  };
}

function selectedMemberContext(
  selectedDeclarationSubject: ExtensionFactSubject | undefined,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): CsharpCheckedSelectedMemberContext {
  const sourceSelectedDeclaration = asNodeSubject(selectedDeclarationSubject);
  const sourceSelectedDeclarationContainer = getNodeParent(ast, sourceSelectedDeclaration);
  return {
    ...(sourceSelectedDeclaration !== undefined ? { sourceSelectedDeclaration } : {}),
    ...(sourceSelectedDeclarationContainer !== undefined ? { sourceSelectedDeclarationContainer } : {}),
  };
}
