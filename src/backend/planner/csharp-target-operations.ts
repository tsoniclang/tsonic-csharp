import type {
  Node,
  SelectedTargetSignatureFact,
  TargetOperationFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  csharpTargetMemberFact,
} from "../../source/csharp-source-semantics/target-types.js";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  targetMemberEquals,
} from "../../source/csharp-facts/equality.js";
import {
  csharpSelectedCallTargetFactKey,
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
  targetMemberAsSourceSelectedSignatureForExpected,
  targetMemberSourceSelectedSignatureUsesFirstArgumentReceiver,
} from "../../source/csharp-source-semantics/selected-target-source-signature.js";
import {
  targetTypeRefEquals,
} from "../../source/csharp-source-semantics/target-ref-utils.js";

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
  const selectedFamilyMatches = selectedCallTargetFamilyMatchesOperation(input, subject, selectedSignature, operation);
  if (operation.selectedMember.id !== selectedSignature.member.id && !selectedFamilyMatches) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched selected member facts: generic selected member '${selectedSignature.member.id}', C# selected member '${operation.selectedMember.id}'.`));
    return undefined;
  }
  const selectedMember = csharpTargetMemberFact(selectedSignature.member);
  if (selectedMember === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} requires a C# selected target member fact for '${selectedSignature.member.id}'.`));
    return undefined;
  }
  const mismatch = selectedFamilyMatches || targetMembersHaveCompatibleSourceSelectedSignature(selectedMember, operation.selectedMember)
    ? undefined
    : getSelectedMemberEmissionFactMismatch(selectedMember, operation.selectedMember) ?? "signature-shape";
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
  if (operation.operationId !== selectedSignature.member.id && !selectedCallTargetFamilyMatchesOperation(input, subject, selectedSignature, operation)) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched target operation facts: generic selected member '${selectedSignature.member.id}', C# '${operation.operationId}'.`));
    return undefined;
  }
  return operation;
}

function selectedCallTargetFamilyMatchesOperation(
  input: TargetCompileInput,
  subject: Node,
  selectedSignature: SelectedTargetSignatureFact,
  operation: CsharpTargetOperationFact,
): boolean {
  if (operation.kind !== "member" || operation.selectedMember === undefined) {
    return false;
  }
  const selectedCallTarget = input.facts.getFact(subject, csharpSelectedCallTargetFactKey);
  const family = selectedCallTarget?.selectionFamily;
  const selectedSourceMember = csharpTargetMemberFact(selectedSignature.member);
  const operationSelection = operation.selectedMember.csharpDeferredTargetSelection;
  if (
    selectedCallTarget === undefined ||
    family === undefined ||
    selectedSourceMember === undefined ||
    operationSelection?.familyId !== family.familyId ||
    !targetMembersHaveCompatibleSourceSelectedSignature(selectedSourceMember, selectedCallTarget.member) ||
    operation.selectedMember.sourceIdentityKeys?.includes(family.sourceIdentity) !== true
  ) {
    return false;
  }
  const knownFamilyMember = family.members.some((candidate) =>
    targetMemberEquals(candidate, operation.selectedMember));
  return knownFamilyMember || selectedCallTarget.finalizationRequirement !== undefined;
}

function getSelectedMemberEmissionFactMismatch(expected: CsharpTargetMember, actual: CsharpTargetMember): string | undefined {
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
  const actualAsSource = targetMemberAsSourceSelectedSignatureForExpected(expected, actual);
  if (!optionalTargetTypeRefEquals(actualAsSource.returnType, expected.returnType)) {
    return "return-type";
  }
  if (!optionalTargetTypeRefEquals(actualAsSource.declaringType, expected.declaringType)) {
    return "declaring-type";
  }
  if (
    actual.receiverPassing === "first-argument" &&
    expected.parameters.length === actual.parameters.length - 1 &&
    !targetMemberSourceSelectedSignatureUsesFirstArgumentReceiver(expected, actual)
  ) {
    return "receiver-type";
  }
  if (actualAsSource.parameters.length !== expected.parameters.length) {
    return "parameter-list";
  }
  for (let index = 0; index < expected.parameters.length; index += 1) {
    const expectedParameter = expected.parameters[index];
    const actualParameter = actualAsSource.parameters[index];
    if (expectedParameter === undefined || actualParameter === undefined) {
      return "parameter-list";
    }
    if (!targetTypeRefEquals(actualParameter.type, expectedParameter.type)) {
      return "parameter-type";
    }
    if (
      actualParameter.passingMode !== expectedParameter.passingMode
    ) {
      return "parameter-passing";
    }
    if (actualParameter.optional !== expectedParameter.optional) {
      return "parameter-optional";
    }
    if (actualParameter.paramsArray !== expectedParameter.paramsArray) {
      return "parameter-params";
    }
    if (!targetParameterMetadataEquals(actualParameter, expectedParameter)) {
      return "parameter-default";
    }
  }
  return undefined;
}

function optionalTargetTypeRefEquals(left: TargetTypeRef | undefined, right: TargetTypeRef | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return targetTypeRefEquals(left, right);
}

function targetParameterMetadataEquals(left: CsharpTargetParameter, right: CsharpTargetParameter): boolean {
  return left.csharpOmittableOptionalArgument === right.csharpOmittableOptionalArgument &&
    targetMetadataValueEquals(left.defaultValue, right.defaultValue) &&
    targetMetadataValueEquals(left.unsupportedDefaultValue, right.unsupportedDefaultValue);
}

function targetMetadataValueEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => targetMetadataValueEquals(item, right[index]));
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => {
      const rightKey = rightKeys[index];
      return key === rightKey && targetMetadataValueEquals(left[key], right[rightKey]);
    });
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
