import type {
  CheckedCallMappingResult,
  CheckedConversionMappingResult,
  CheckedOperationMappingResult,
  ContextualTargetTypeResult,
  ExtensionObservation,
  ProviderDeclarationIdentity,
  RuntimeCarrierFactResult,
  TargetConstraint,
  TargetMember,
  TargetOperationProposal,
  TargetParameter,
  TargetSignatureSelection,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "./target-types.js";

export function targetMemberAsSelection(member: TargetMember | CsharpTargetMember): TargetMember {
  return {
    id: member.id,
    sourceName: member.sourceName,
    targetName: member.targetName,
    kind: member.kind,
    ...(member.static === undefined ? {} : { static: member.static }),
    parameters: member.parameters.map(targetParameterAsSelection),
    ...(member.returnType === undefined ? {} : { returnType: targetTypeRefAsSelection(member.returnType) }),
    ...(member.typeParameters === undefined ? {} : {
      typeParameters: member.typeParameters.map(targetTypeParameterAsSelection),
    }),
    ...(member.overloadGroup === undefined ? {} : { overloadGroup: member.overloadGroup }),
    ...(member.providerDeclaration === undefined ? {} : {
      providerDeclaration: providerDeclarationAsSelection(member.providerDeclaration),
    }),
  };
}

export function targetMemberSelectionEquals(left: TargetMember, right: TargetMember): boolean {
  return left.id === right.id &&
    left.sourceName === right.sourceName &&
    left.targetName === right.targetName &&
    left.kind === right.kind &&
    left.static === right.static &&
    left.overloadGroup === right.overloadGroup &&
    targetParameterSelectionArrayEquals(left.parameters, right.parameters) &&
    optionalTargetTypeRefSelectionEquals(left.returnType, right.returnType) &&
    targetTypeParameterSelectionArrayEquals(left.typeParameters, right.typeParameters) &&
    providerDeclarationSelectionEquals(left.providerDeclaration, right.providerDeclaration);
}

export function checkedCallObservationAsSelection(
  observation: ExtensionObservation<CheckedCallMappingResult>,
): ExtensionObservation<CheckedCallMappingResult> {
  return mapAcceptedObservation(observation, (value) => value.kind === "source"
    ? { kind: "source" }
    : {
        kind: "target",
        selectedSignature: targetSignatureAsSelection(value.selectedSignature),
        argumentConversions: value.argumentConversions.map((slot) => ({
          sourceArgumentIndex: slot.sourceArgumentIndex,
          sourceForm: slot.sourceForm,
          ...(slot.spreadElementIndex === undefined ? {} : { spreadElementIndex: slot.spreadElementIndex }),
          targetParameterIndex: slot.targetParameterIndex,
          targetForm: slot.targetForm,
        })),
      });
}

export function checkedOperationObservationAsSelection(
  observation: ExtensionObservation<CheckedOperationMappingResult>,
): ExtensionObservation<CheckedOperationMappingResult> {
  return mapAcceptedObservation(observation, (value) => ({
    operation: targetOperationProposalAsSelection(value.operation),
    ...(value.resultType === undefined ? {} : { resultType: targetTypeRefAsSelection(value.resultType) }),
    ...(value.providerDeclaration === undefined ? {} : {
      providerDeclaration: providerDeclarationAsSelection(value.providerDeclaration),
    }),
  }));
}

export function checkedConversionObservationAsSelection(
  observation: ExtensionObservation<CheckedConversionMappingResult>,
): ExtensionObservation<CheckedConversionMappingResult> {
  return mapAcceptedObservation(observation, (value) => ({
    ...(value.convertedType === undefined ? {} : { convertedType: targetTypeRefAsSelection(value.convertedType) }),
    ...(value.operation === undefined ? {} : { operation: targetOperationProposalAsSelection(value.operation) }),
    ...(value.providerDeclaration === undefined ? {} : {
      providerDeclaration: providerDeclarationAsSelection(value.providerDeclaration),
    }),
  }));
}

export function runtimeCarrierObservationAsSelection(
  observation: ExtensionObservation<RuntimeCarrierFactResult>,
): ExtensionObservation<RuntimeCarrierFactResult> {
  return mapAcceptedObservation(observation, (value) => ({
    carrier: targetTypeRefAsSelection(value.carrier),
    ...(value.requiresAllocation === undefined ? {} : { requiresAllocation: value.requiresAllocation }),
    ...(value.provenance === undefined ? {} : {
      provenance: {
        ...(value.provenance.sourceType === undefined ? {} : { sourceType: value.provenance.sourceType }),
        ...(value.provenance.sourceTypeReference === undefined ? {} : {
          sourceTypeReference: value.provenance.sourceTypeReference,
        }),
        ...(value.provenance.sourceSymbol === undefined ? {} : { sourceSymbol: value.provenance.sourceSymbol }),
        ...(value.provenance.providerDeclaration === undefined ? {} : {
          providerDeclaration: providerDeclarationAsSelection(value.provenance.providerDeclaration),
        }),
      },
    }),
  }));
}

export function contextualTargetTypeObservationAsSelection(
  observation: ExtensionObservation<ContextualTargetTypeResult>,
): ExtensionObservation<ContextualTargetTypeResult> {
  return mapAcceptedObservation(observation, (value) => ({
    type: value.type,
    ...(value.targetType === undefined ? {} : { targetType: targetTypeRefAsSelection(value.targetType) }),
  }));
}

export function targetSignatureAsSelection(selection: TargetSignatureSelection): TargetSignatureSelection {
  return {
    member: targetMemberAsSelection(selection.member),
    ...(selection.targetTypeArguments === undefined ? {} : {
      targetTypeArguments: selection.targetTypeArguments.map(targetTypeRefAsSelection),
    }),
    ...(selection.providerDeclaration === undefined ? {} : {
      providerDeclaration: providerDeclarationAsSelection(selection.providerDeclaration),
    }),
  };
}

function targetOperationProposalAsSelection(operation: TargetOperationProposal): TargetOperationProposal {
  return {
    operationId: operation.operationId,
    operationKind: operation.operationKind,
    targetOperation: operation.targetOperation,
    ...(operation.evidence === undefined ? {} : { evidence: operation.evidence }),
  };
}

function mapAcceptedObservation<T>(
  observation: ExtensionObservation<T>,
  mapValue: (value: T) => T,
): ExtensionObservation<T> {
  if (observation.kind !== "accept") {
    return observation;
  }
  return {
    kind: "accept",
    value: mapValue(observation.value),
    ...(observation.evidence === undefined ? {} : { evidence: observation.evidence }),
  };
}

export function targetTypeRefAsSelection(type: TargetTypeRef): TargetTypeRef {
  switch (type.kind) {
    case "source-primitive":
      return { kind: type.kind, name: type.name };
    case "source-global":
      return {
        kind: type.kind,
        name: type.name,
        ...(type.typeArguments === undefined ? {} : {
          typeArguments: type.typeArguments.map(targetTypeRefAsSelection),
        }),
      };
    case "target-named":
      return {
        kind: type.kind,
        id: type.id,
        ...(type.typeArguments === undefined ? {} : {
          typeArguments: type.typeArguments.map(targetTypeRefAsSelection),
        }),
      };
    case "type-parameter":
      return { kind: type.kind, name: type.name };
    case "array":
      return {
        kind: type.kind,
        element: targetTypeRefAsSelection(type.element),
        ...(type.rank === undefined ? {} : { rank: type.rank }),
      };
    case "tuple":
      return { kind: type.kind, elements: type.elements.map(targetTypeRefAsSelection) };
    case "pointer":
      return {
        kind: type.kind,
        pointee: targetTypeRefAsSelection(type.pointee),
        ...(type.mutability === undefined ? {} : { mutability: type.mutability }),
      };
    case "function-pointer":
      return {
        kind: type.kind,
        args: type.args.map(targetTypeRefAsSelection),
        result: targetTypeRefAsSelection(type.result),
        ...(type.abi === undefined ? {} : { abi: type.abi }),
      };
    case "opaque":
      return { kind: type.kind, id: type.id };
    case "associated-type":
      return {
        kind: type.kind,
        owner: targetTypeRefAsSelection(type.owner),
        name: type.name,
      };
    case "lifetime":
      return { kind: type.kind, name: type.name };
    case "target-specific":
      return {
        kind: type.kind,
        target: type.target,
        name: type.name,
        ...(type.payloadId === undefined ? {} : { payloadId: type.payloadId }),
      };
  }
}

function targetParameterAsSelection(parameter: TargetParameter | CsharpTargetParameter): TargetParameter {
  return {
    name: parameter.name,
    type: targetTypeRefAsSelection(parameter.type),
    passingMode: parameter.passingMode,
    ...(parameter.optional === undefined ? {} : { optional: parameter.optional }),
    ...(parameter.paramsArray === undefined ? {} : { paramsArray: parameter.paramsArray }),
  };
}

function targetParameterSelectionArrayEquals(
  left: readonly TargetParameter[],
  right: readonly TargetParameter[],
): boolean {
  return left.length === right.length && left.every((parameter, index) => {
    const other = right[index];
    return other !== undefined &&
      parameter.name === other.name &&
      parameter.passingMode === other.passingMode &&
      parameter.optional === other.optional &&
      parameter.paramsArray === other.paramsArray &&
      targetTypeRefSelectionEquals(parameter.type, other.type);
  });
}

function targetTypeParameterSelectionArrayEquals(
  left: readonly TargetTypeParameter[] | undefined,
  right: readonly TargetTypeParameter[] | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.length === right.length && left.every((parameter, index) => {
    const other = right[index];
    return other !== undefined &&
      parameter.name === other.name &&
      parameter.variance === other.variance &&
      targetConstraintSelectionArrayEquals(parameter.constraints, other.constraints);
  });
}

function targetConstraintSelectionArrayEquals(
  left: readonly TargetConstraint[] | undefined,
  right: readonly TargetConstraint[] | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.length === right.length && left.every((constraint, index) => {
    const other = right[index];
    if (other === undefined || constraint.kind !== other.kind) {
      return false;
    }
    switch (constraint.kind) {
      case "implements":
        return other.kind === "implements" &&
          constraint.contract === other.contract &&
          targetTypeRefSelectionArrayEquals(constraint.typeArguments, other.typeArguments);
      case "lifetime":
        return other.kind === "lifetime" && constraint.name === other.name;
      case "target-specific":
        return other.kind === "target-specific" &&
          constraint.target === other.target &&
          constraint.name === other.name &&
          constraint.payloadId === other.payloadId;
      case "value-type":
      case "reference-type":
      case "constructible":
      case "unmanaged":
      case "copy":
      case "clone":
      case "default":
      case "sized":
        return true;
    }
  });
}

function optionalTargetTypeRefSelectionEquals(
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
): boolean {
  return left === undefined || right === undefined ? left === right : targetTypeRefSelectionEquals(left, right);
}

function targetTypeRefSelectionArrayEquals(
  left: readonly TargetTypeRef[] | undefined,
  right: readonly TargetTypeRef[] | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.length === right.length && left.every((type, index) => {
    const other = right[index];
    return other !== undefined && targetTypeRefSelectionEquals(type, other);
  });
}

function targetTypeRefSelectionEquals(left: TargetTypeRef, right: TargetTypeRef): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "source-primitive":
      return right.kind === "source-primitive" && left.name === right.name;
    case "source-global":
      return right.kind === "source-global" &&
        left.name === right.name &&
        targetTypeRefSelectionArrayEquals(left.typeArguments, right.typeArguments);
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetTypeRefSelectionArrayEquals(left.typeArguments, right.typeArguments);
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
    case "array":
      return right.kind === "array" &&
        left.rank === right.rank &&
        targetTypeRefSelectionEquals(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" && targetTypeRefSelectionArrayEquals(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer" &&
        left.mutability === right.mutability &&
        targetTypeRefSelectionEquals(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer" &&
        stringSelectionArrayEquals(left.abi, right.abi) &&
        targetTypeRefSelectionArrayEquals(left.args, right.args) &&
        targetTypeRefSelectionEquals(left.result, right.result);
    case "opaque":
      return right.kind === "opaque" && left.id === right.id;
    case "associated-type":
      return right.kind === "associated-type" &&
        left.name === right.name &&
        targetTypeRefSelectionEquals(left.owner, right.owner);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific" &&
        left.target === right.target &&
        left.name === right.name &&
        left.payloadId === right.payloadId;
  }
}

function stringSelectionArrayEquals(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function providerDeclarationSelectionEquals(
  left: ProviderDeclarationIdentity | undefined,
  right: ProviderDeclarationIdentity | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.providerId === right.providerId &&
    left.providerVersion === right.providerVersion &&
    left.providerModuleId === right.providerModuleId &&
    left.moduleSpecifier === right.moduleSpecifier &&
    left.artifactFileName === right.artifactFileName &&
    left.exportName === right.exportName &&
    left.exportId === right.exportId &&
    left.memberName === right.memberName &&
    providerMemberKeySelectionEquals(left.memberKey, right.memberKey) &&
    left.memberId === right.memberId &&
    left.memberStatic === right.memberStatic &&
    left.signatureId === right.signatureId &&
    optionalTargetTypeRefSelectionEquals(left.targetIdentity, right.targetIdentity);
}

function providerMemberKeySelectionEquals(
  left: ProviderDeclarationIdentity["memberKey"],
  right: ProviderDeclarationIdentity["memberKey"],
): boolean {
  return left === undefined || right === undefined
    ? left === right
    : left.kind === right.kind && left.name === right.name;
}

function targetTypeParameterAsSelection(parameter: TargetTypeParameter): TargetTypeParameter {
  return {
    name: parameter.name,
    ...(parameter.constraints === undefined ? {} : {
      constraints: parameter.constraints.map(targetConstraintAsSelection),
    }),
    ...(parameter.variance === undefined ? {} : { variance: parameter.variance }),
  };
}

function targetConstraintAsSelection(constraint: TargetConstraint): TargetConstraint {
  switch (constraint.kind) {
    case "implements":
      return {
        kind: constraint.kind,
        contract: constraint.contract,
        ...(constraint.typeArguments === undefined ? {} : {
          typeArguments: constraint.typeArguments.map(targetTypeRefAsSelection),
        }),
      };
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
    case "copy":
    case "clone":
    case "default":
    case "sized":
      return { kind: constraint.kind };
    case "lifetime":
      return { kind: constraint.kind, name: constraint.name };
    case "target-specific":
      return {
        kind: constraint.kind,
        target: constraint.target,
        name: constraint.name,
        ...(constraint.payloadId === undefined ? {} : { payloadId: constraint.payloadId }),
      };
  }
}

export function providerDeclarationAsSelection(
  declaration: ProviderDeclarationIdentity,
): ProviderDeclarationIdentity {
  return {
    providerId: declaration.providerId,
    ...(declaration.providerVersion === undefined ? {} : { providerVersion: declaration.providerVersion }),
    providerModuleId: declaration.providerModuleId,
    moduleSpecifier: declaration.moduleSpecifier,
    ...(declaration.artifactFileName === undefined ? {} : { artifactFileName: declaration.artifactFileName }),
    ...(declaration.exportName === undefined ? {} : { exportName: declaration.exportName }),
    ...(declaration.exportId === undefined ? {} : { exportId: declaration.exportId }),
    ...(declaration.memberName === undefined ? {} : { memberName: declaration.memberName }),
    ...(declaration.memberKey === undefined ? {} : { memberKey: declaration.memberKey }),
    ...(declaration.memberId === undefined ? {} : { memberId: declaration.memberId }),
    ...(declaration.memberStatic === undefined ? {} : { memberStatic: declaration.memberStatic }),
    ...(declaration.signatureId === undefined ? {} : { signatureId: declaration.signatureId }),
    ...(declaration.targetIdentity === undefined ? {} : {
      targetIdentity: targetTypeRefAsSelection(declaration.targetIdentity),
    }),
  };
}
