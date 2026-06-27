import type {
  TargetConversionOperatorFact,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  DotnetConversionOperatorDeclaration,
  DotnetMemberDeclaration,
  DotnetParameterDeclaration,
  DotnetSignatureDeclaration,
} from "../model-types.js";
import {
  dotnetAttributeToTargetAttribute,
  dotnetUnsupportedAttributeToTargetUnsupportedAttribute,
} from "./attributes.js";
import {
  type DotnetTargetTypeParameter,
  dotnetTypeParameterToTargetTypeParameter,
} from "./constraints.js";
import {
  dotnetTypeRefToTargetTypeRef,
} from "./type-ref.js";

export type DotnetTargetParameter = TargetParameter;

export type DotnetTargetMember = TargetMember & {
  readonly typeParameters?: readonly DotnetTargetTypeParameter[];
};

export function dotnetMemberToTargetMembers(member: DotnetMemberDeclaration, declaringType: TargetTypeRef): readonly DotnetTargetMember[] {
  switch (member.kind) {
    case "method":
    case "constructor":
    case "indexer":
    case "operator":
      return (member.signatures ?? []).map((signature) => dotnetSignatureToTargetMember(member, signature, declaringType));
    case "property":
    case "field":
    case "event":
      return member.type === undefined
        ? []
        : [{
            id: member.targetId,
            sourceName: member.sourceName,
            targetName: member.targetName,
            kind: member.kind,
            declaringType,
            ...(member.static === true ? { static: true } : {}),
            ...(dotnetMemberIsReadonly(member) ? { readonly: true } : {}),
            ...(member.receiverPassing !== undefined ? { receiverPassing: member.receiverPassing } : {}),
            parameters: [],
            returnType: dotnetTypeRefToTargetTypeRef(member.type),
            ...(member.attributes !== undefined && member.attributes.length > 0
              ? { attributes: member.attributes.map(dotnetAttributeToTargetAttribute) }
              : {}),
            ...(member.unsupportedAttributes !== undefined && member.unsupportedAttributes.length > 0
              ? { unsupportedAttributes: member.unsupportedAttributes.map(dotnetUnsupportedAttributeToTargetUnsupportedAttribute) }
              : {}),
          }];
  }
}

export function dotnetConversionOperatorToTargetConversionOperator(
  declaration: DotnetConversionOperatorDeclaration,
  declaringType: TargetTypeRef,
): TargetConversionOperatorFact {
  return {
    id: declaration.id,
    conversionKind: declaration.conversionKind,
    declaringType,
    sourceType: dotnetTypeRefToTargetTypeRef(declaration.sourceType),
    targetType: dotnetTypeRefToTargetTypeRef(declaration.targetType),
  };
}

function dotnetSignatureToTargetMember(
  member: DotnetMemberDeclaration,
  signature: DotnetSignatureDeclaration,
  declaringType: TargetTypeRef,
): DotnetTargetMember {
  return {
    id: signature.id,
    sourceName: member.sourceName,
    targetName: signature.targetName ?? member.targetName,
    kind: member.kind,
    declaringType,
    ...(member.static === true ? { static: true } : {}),
    ...(dotnetMemberIsReadonly(member) ? { readonly: true } : {}),
    ...(member.receiverPassing !== undefined ? { receiverPassing: member.receiverPassing } : {}),
    parameters: signature.parameters.map(dotnetParameterToTargetParameter),
    ...(signature.targetReturnType !== undefined || signature.returnType !== undefined
      ? { returnType: dotnetTypeRefToTargetTypeRef(signature.targetReturnType ?? signature.returnType!) }
      : {}),
    ...(signature.attributes !== undefined && signature.attributes.length > 0
      ? { attributes: signature.attributes.map(dotnetAttributeToTargetAttribute) }
      : {}),
    ...(signature.unsupportedAttributes !== undefined && signature.unsupportedAttributes.length > 0
      ? { unsupportedAttributes: signature.unsupportedAttributes.map(dotnetUnsupportedAttributeToTargetUnsupportedAttribute) }
      : {}),
    ...(signature.returnAttributes !== undefined && signature.returnAttributes.length > 0
      ? { returnAttributes: signature.returnAttributes.map(dotnetAttributeToTargetAttribute) }
      : {}),
    ...(signature.unsupportedReturnAttributes !== undefined && signature.unsupportedReturnAttributes.length > 0
      ? { unsupportedReturnAttributes: signature.unsupportedReturnAttributes.map(dotnetUnsupportedAttributeToTargetUnsupportedAttribute) }
      : {}),
    ...(signature.typeParameters !== undefined && signature.typeParameters.length > 0
      ? { typeParameters: signature.typeParameters.map(dotnetTypeParameterToTargetTypeParameter) }
      : {}),
    overloadGroup: dotnetTargetMemberOverloadGroup(member),
  };
}

function dotnetParameterToTargetParameter(parameter: DotnetParameterDeclaration): DotnetTargetParameter {
  return {
    name: parameter.name,
    type: dotnetTypeRefToTargetTypeRef(parameter.type),
    passingMode: parameter.passingMode,
    ...(parameter.optional === true ? { optional: true } : {}),
    ...(parameter.rest === true ? { paramsArray: true } : {}),
    ...(parameter.defaultValue !== undefined ? { defaultValue: parameter.defaultValue } : {}),
    ...(parameter.unsupportedDefaultValue !== undefined ? { unsupportedDefaultValue: parameter.unsupportedDefaultValue } : {}),
    ...(parameter.attributes !== undefined && parameter.attributes.length > 0
      ? { attributes: parameter.attributes.map(dotnetAttributeToTargetAttribute) }
      : {}),
    ...(parameter.unsupportedAttributes !== undefined && parameter.unsupportedAttributes.length > 0
      ? { unsupportedAttributes: parameter.unsupportedAttributes.map(dotnetUnsupportedAttributeToTargetUnsupportedAttribute) }
      : {}),
  };
}

function dotnetMemberIsReadonly(member: DotnetMemberDeclaration): boolean {
  return (member.kind === "property" || member.kind === "field" || member.kind === "indexer") && member.writable !== true;
}

function dotnetTargetMemberOverloadGroup(member: DotnetMemberDeclaration): string {
  return member.kind === "constructor"
    ? dotnetMetadataNameWithoutSignature(member.targetId)
    : member.targetId;
}

function dotnetMetadataNameWithoutSignature(metadataName: string): string {
  const signatureStart = metadataName.indexOf("(");
  return signatureStart === -1 ? metadataName : metadataName.slice(0, signatureStart);
}
