import type {
  CheckedElementAccessMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";

export interface CsharpCheckedSelectedMemberContext {
  readonly sourceSelectedSymbol?: ExtensionFactSubject;
  readonly sourceSelectedDeclaration?: ExtensionFactSubject;
}

export type CsharpCheckedPropertyAccessRequestContext = CsharpCheckedSelectedMemberContext;

export type CsharpCheckedElementAccessRequestContext = CsharpCheckedSelectedMemberContext;

export function getCsharpCheckedPropertyAccessRequestContext(
  request: CheckedPropertyAccessMappingRequest,
  _context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): CsharpCheckedPropertyAccessRequestContext {
  return selectedMemberContext(request.sourceResult.selectedSymbol, request.sourceResult.selectedDeclaration);
}

export function getCsharpCheckedElementAccessRequestContext(
  request: CheckedElementAccessMappingRequest,
  _context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): CsharpCheckedElementAccessRequestContext {
  return selectedMemberContext(request.sourceResult.selectedSymbol, request.sourceResult.selectedDeclaration);
}

function selectedMemberContext(
  selectedSymbol: ExtensionFactSubject | undefined,
  selectedDeclaration: ExtensionFactSubject | undefined,
): CsharpCheckedSelectedMemberContext {
  return {
    ...(selectedSymbol !== undefined ? { sourceSelectedSymbol: selectedSymbol } : {}),
    ...(selectedDeclaration !== undefined ? { sourceSelectedDeclaration: selectedDeclaration } : {}),
  };
}
