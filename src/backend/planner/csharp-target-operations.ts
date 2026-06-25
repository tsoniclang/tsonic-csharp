import type {
  Node,
  SelectedTargetSignatureFact,
  TargetMember,
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
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  invalidExpression,
} from "./invalid-expression.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

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
    return invalidExpression(`${purpose} operation kind`);
  }
  if (operation.static !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `${purpose} requires a finalized static C# member operation fact before emission.`));
    return invalidExpression(`${purpose} static member`);
  }
  const declaringType = operation.declaringType === undefined ? undefined : csharpTypeFromTargetTypeRef(operation.declaringType);
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `${purpose} requires a provider-owned declaring target type fact before C# emission.`));
    return invalidExpression(`${purpose} declaring type`);
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: declaringType,
    name: operation.memberName,
  };
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
  const mismatch = getSelectedMemberEmissionFactMismatch(selectedSignature.member, operation.selectedMember);
  if (mismatch !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched selected member ${mismatch} facts for '${selectedSignature.member.id}'.`));
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

function getSelectedMemberEmissionFactMismatch(expected: TargetMember, actual: TargetMember): string | undefined {
  if (actual.kind !== expected.kind) {
    return "kind";
  }
  if (actual.targetName !== expected.targetName) {
    return "target-name";
  }
  if (actual.static !== expected.static) {
    return "static-dispatch";
  }
  if (actual.receiverPassing !== expected.receiverPassing) {
    return "receiver-passing";
  }
  if (actual.parameters.length !== expected.parameters.length) {
    return "parameter-list";
  }
  for (let index = 0; index < expected.parameters.length; index += 1) {
    const expectedParameter = expected.parameters[index];
    const actualParameter = actual.parameters[index];
    if (expectedParameter === undefined || actualParameter === undefined) {
      return "parameter-list";
    }
    if (
      actualParameter.passingMode !== expectedParameter.passingMode ||
      actualParameter.optional !== expectedParameter.optional ||
      actualParameter.paramsArray !== expectedParameter.paramsArray
    ) {
      return "parameter-passing";
    }
  }
  return undefined;
}
