import type {
  CheckedElementAccessMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  getSelectedAccessEvidence,
} from "./selected-source-evidence.js";

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
  const evidence = getSelectedAccessEvidence(request);
  return selectedMemberContext(evidence.selectedSymbol, evidence.selectedDeclaration);
}

export function getCsharpCheckedElementAccessRequestContext(
  request: CheckedElementAccessMappingRequest,
  _context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): CsharpCheckedElementAccessRequestContext {
  const evidence = getSelectedAccessEvidence(request);
  return selectedMemberContext(evidence.selectedSymbol, evidence.selectedDeclaration);
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
