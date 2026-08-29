import type {
  TargetBindingFact,
  TargetTypeRef,
} from "../../../policy/types/index.js";
import type {
  DotnetExportDeclaration,
  DotnetTypeDeclaration,
  DotnetTypeKind,
} from "../model/types.js";
import {
  type CsharpTargetBindingFact,
  csharpTargetNamedType,
} from "../../../policy/types/index.js";
import type {
  DotnetUnsupportedConstraintDeclaration,
  DotnetUnsupportedMemberDeclaration,
} from "../model/types.js";
import {
  dotnetAttributeToTargetAttribute,
  dotnetUnsupportedAttributeToTargetUnsupportedAttribute,
} from "./attributes.js";
import {
  dotnetConstraintToTargetConstraint,
  type DotnetTargetTypeParameter,
  dotnetTypeParameterToTargetTypeParameter,
} from "./constraints.js";
import {
  dotnetConversionOperatorToTargetConversionOperator,
  type DotnetTargetMember,
  dotnetMemberToTargetMembers,
} from "./members.js";
import {
  csharpTargetMetadataFromDotnetTypeDeclaration,
  dotnetRenderShapeToCsharpRenderShape,
  dotnetTypeRefToTargetTypeRef,
  requireDotnetTargetId,
} from "./type-ref.js";

export {
  dotnetConstraintToTargetConstraint,
} from "./constraints.js";
export {
  dotnetTypeRefToTargetTypeRef,
} from "./type-ref.js";
export type {
  DotnetTargetMember,
  DotnetTargetParameter,
} from "./members.js";

export type DotnetTargetBindingFact = CsharpTargetBindingFact & {
  readonly typeParameters?: readonly DotnetTargetTypeParameter[];
  readonly members?: readonly DotnetTargetMember[];
  readonly unsupportedImplementedContracts?: readonly DotnetUnsupportedConstraintDeclaration[];
  readonly unsupportedMembers?: readonly DotnetUnsupportedMemberDeclaration[];
};

export function dotnetExportToTargetBinding(declaration: DotnetExportDeclaration): TargetBindingFact | undefined {
  return declaration.kind === "type" ? dotnetTypeToTargetBinding(declaration) : undefined;
}

function dotnetTypeToTargetBinding(declaration: DotnetTypeDeclaration): TargetBindingFact {
  const targetId = requireDotnetTargetId(declaration.targetId, declaration.metadataName);
  const declaredCsharpType = declaration.targetType === undefined
    ? csharpTargetNamedType(
        targetId,
        declaration.typeParameters?.map((parameter) => ({ kind: "type-parameter", name: parameter.name }) satisfies TargetTypeRef),
        declaration.renderShape === undefined ? undefined : dotnetRenderShapeToCsharpRenderShape(declaration.renderShape),
        csharpTargetMetadataFromDotnetTypeDeclaration(declaration),
      )
    : dotnetTypeRefToTargetTypeRef(declaration.targetType);
  const baseType = declaration.baseType === undefined
    ? undefined
    : dotnetTypeRefToTargetTypeRef(declaration.baseType);
  const binding = {
    id: targetId,
    sourceName: declaration.sourceName,
    targetName: declaration.displayName ?? declaration.metadataName,
    target: "csharp",
    kind: dotnetTypeKindToTargetBindingKind(declaration.typeKind),
    csharpType: declaredCsharpType,
    ...(declaration.abstract === true ? { csharpAbstract: true as const } : {}),
    ...(declaration.unmanagedTypeParameterIndexes === undefined
      ? {}
      : {
          csharpUnmanagedTypeParameterIndexes:
            declaration.unmanagedTypeParameterIndexes,
        }),
    ...(baseType !== undefined ? { csharpBaseType: baseType } : {}),
    ...(declaration.attributes !== undefined && declaration.attributes.length > 0
      ? { attributes: declaration.attributes.map(dotnetAttributeToTargetAttribute) }
      : {}),
    ...(declaration.unsupportedAttributes !== undefined && declaration.unsupportedAttributes.length > 0
      ? { unsupportedAttributes: declaration.unsupportedAttributes.map(dotnetUnsupportedAttributeToTargetUnsupportedAttribute) }
      : {}),
    ...(declaration.typeParameters !== undefined && declaration.typeParameters.length > 0
      ? { typeParameters: declaration.typeParameters.map(dotnetTypeParameterToTargetTypeParameter) }
      : {}),
    ...(declaration.implementedContracts !== undefined && declaration.implementedContracts.length > 0
      ? { implementedContracts: declaration.implementedContracts.map(dotnetConstraintToTargetConstraint) }
      : {}),
    ...(declaration.unsupportedImplementedContracts !== undefined && declaration.unsupportedImplementedContracts.length > 0
      ? { unsupportedImplementedContracts: declaration.unsupportedImplementedContracts }
      : {}),
    ...(declaration.members !== undefined && declaration.members.length > 0
      ? { members: declaration.members.flatMap((member) => dotnetMemberToTargetMembers(member, declaredCsharpType)) }
      : {}),
    ...(declaration.unsupportedMembers !== undefined && declaration.unsupportedMembers.length > 0
      ? { unsupportedMembers: declaration.unsupportedMembers }
      : {}),
    ...(declaration.conversionOperators !== undefined && declaration.conversionOperators.length > 0
      ? { conversionOperators: declaration.conversionOperators.map((operator) => dotnetConversionOperatorToTargetConversionOperator(operator, declaredCsharpType)) }
      : {}),
  } satisfies DotnetTargetBindingFact;
  return binding;
}

function dotnetTypeKindToTargetBindingKind(kind: DotnetTypeKind): TargetBindingFact["kind"] {
  switch (kind) {
    case "class":
    case "struct":
    case "interface":
    case "enum":
    case "delegate":
    case "opaque":
      return kind;
  }
}
