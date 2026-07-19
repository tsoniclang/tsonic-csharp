import type {
  Node,
  SelectedTargetSignatureFact,
  TargetOperationFact,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  csharpTargetConversionOperationFactKey,
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import type {
  CsharpTargetOperationFact,
  CsharpTargetMemberOperationFact,
} from "../../source/csharp-facts.js";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  targetMembersHaveCompatibleSourceSelectedSignature,
} from "../../source/csharp-source-semantics/selected-target-source-signature.js";

export function getRequiredCsharpTargetOperation(
  input: TargetCompileInput,
  subject: Node,
  selectedOperation: TargetOperationFact,
  diagnostics: TargetDiagnostic[],
  purpose: string,
): CsharpTargetOperationFact | undefined {
  const operation = input.facts.getFact(subject, csharpTargetOperationFactKey);
  if (operation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} requires a finalized C# target operation fact; the generic TSTS target operation '${selectedOperation.operationId}' is not enough for C# emission.`));
    return undefined;
  }
  if (operation.operationId !== selectedOperation.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched target operation facts: generic '${selectedOperation.operationId}', C# '${operation.operationId}'.`));
    return undefined;
  }
  return operation;
}

export function getRequiredCsharpTargetConversionOperation(
  input: TargetCompileInput,
  subject: Node,
  selectedOperation: TargetOperationFact,
  diagnostics: TargetDiagnostic[],
  purpose: string,
): CsharpTargetOperationFact | undefined {
  const operation = input.facts.getFact(subject, csharpTargetConversionOperationFactKey);
  if (operation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} requires a finalized C# target conversion operation fact; the generic TSTS target conversion '${selectedOperation.operationId}' is not enough for C# emission.`));
    return undefined;
  }
  if (operation.operationId !== selectedOperation.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched target conversion operation facts: generic '${selectedOperation.operationId}', C# '${operation.operationId}'.`));
    return undefined;
  }
  return operation;
}

export function csharpStaticMemberExpression(
  operation: CsharpTargetOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
  purpose: string,
): CsharpExpression | undefined {
  if (operation.kind !== "member") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `${purpose} requires a finalized C# member operation fact, but provider recorded '${operation.kind}'.`));
    return undefined;
  }
  if (operation.static !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `${purpose} requires a finalized static C# member operation fact before emission.`));
    return undefined;
  }
  const declaringType = operation.declaringType === undefined ? undefined : csharpTypeFromTargetTypeRef(operation.declaringType);
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `${purpose} requires a provider-owned declaring target type fact before C# emission.`));
    return undefined;
  }
  const typeArguments = csharpTypeArgumentsFromTargetOperation(operation, diagnostics, node, purpose);
  if (typeArguments === undefined) {
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: declaringType,
    name: operation.memberName,
    ...(typeArguments.length === 0 ? {} : { typeArguments }),
  };
}

export function csharpTypeArgumentsFromTargetOperation(
  operation: Extract<CsharpTargetOperationFact, { readonly kind: "member" }>,
  diagnostics: TargetDiagnostic[],
  node: Node,
  purpose: string,
): readonly CsharpTypeNode[] | undefined {
  const typeArguments: CsharpTypeNode[] = [];
  for (const typeArgument of operation.typeArguments ?? []) {
    const rendered = csharpTypeFromTargetTypeRef(typeArgument);
    if (rendered === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, `${purpose} requires renderable generic target argument facts before C# emission.`));
      return undefined;
    }
    typeArguments.push(rendered);
  }
  return typeArguments;
}

export function getRequiredCsharpTargetMemberOperationForSelectedSignature(
  input: TargetCompileInput,
  subject: Node,
  selectedSignature: SelectedTargetSignatureFact,
  diagnostics: TargetDiagnostic[],
  purpose: string,
): CsharpTargetMemberOperationFact | undefined {
  const operation = getRequiredCsharpTargetOperationForSelectedSignature(input, subject, selectedSignature, diagnostics, purpose);
  if (operation === undefined) {
    return undefined;
  }
  if (operation.kind !== "member") {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} requires a finalized C# member operation fact, but provider recorded '${operation.kind}'.`));
    return undefined;
  }
  if (operation.selectedMember === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} requires a closed selected C# member in the finalized operation fact.`));
    return undefined;
  }
  if (operation.selectedMember.id !== selectedSignature.member.id) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched selected member facts: generic selected member '${selectedSignature.member.id}', C# selected member '${operation.selectedMember.id}'.`));
    return undefined;
  }
  if (
    !targetMembersHaveCompatibleSourceSelectedSignature(selectedSignature.member, operation.selectedMember)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received a C# selected member whose canonical source signature does not match '${selectedSignature.member.id}'.`));
    return undefined;
  }
  if (operation.operationKind !== operation.selectedMember.kind) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched target operation kind facts for '${selectedSignature.member.id}'.`));
    return undefined;
  }
  if (operation.memberName !== operation.selectedMember.targetName) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched target member-name facts for '${selectedSignature.member.id}'.`));
    return undefined;
  }
  return operation;
}

export function getRequiredCsharpTargetOperationForSelectedSignature(
  input: TargetCompileInput,
  subject: Node,
  selectedSignature: SelectedTargetSignatureFact,
  diagnostics: TargetDiagnostic[],
  purpose: string,
): CsharpTargetOperationFact | undefined {
  const operation = input.facts.getFact(subject, csharpTargetOperationFactKey);
  if (operation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} requires a finalized C# target operation fact; the generic selected target member '${selectedSignature.member.id}' is not enough for C# emission.`));
    return undefined;
  }
  if (operation.operationId !== selectedSignature.member.id) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched target operation facts: generic selected member '${selectedSignature.member.id}', C# '${operation.operationId}'.`));
    return undefined;
  }
  return operation;
}
