import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetConversionOperatorFact,
  CsharpTargetMember,
  CsharpTargetParameter,
} from "../../../source/csharp-source-semantics/target-types.js";
import type {
  DotnetConversionOperatorDeclaration,
  DotnetMemberDeclaration,
  DotnetParameterDeclaration,
  DotnetSignatureDeclaration,
  DotnetTypeRef,
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
import {
  dotnetProviderSignatureIdsForMember,
} from "../declaration-model/signatures.js";

export type DotnetTargetParameter = CsharpTargetParameter;

export type DotnetTargetMember = CsharpTargetMember & {
  readonly typeParameters?: readonly DotnetTargetTypeParameter[];
};

export function dotnetMemberToTargetMembers(member: DotnetMemberDeclaration, declaringType: TargetTypeRef): readonly DotnetTargetMember[] {
  switch (member.kind) {
    case "method":
    case "constructor":
    case "indexer":
    case "operator":
      const memberTargetName = member.kind === "constructor" ? undefined : member.targetName;
      const providerSignatureIds = dotnetProviderSignatureIdsForMember(member, memberTargetName);
      const targetDeclaringType = member.targetDeclaringType === undefined
        ? declaringType
        : dotnetTypeRefToTargetTypeRef(member.targetDeclaringType);
      return (member.signatures ?? []).map((signature) =>
        dotnetSignatureToTargetMember(member, signature, targetDeclaringType, signature.providerSourceSignatureId ?? providerSignatureIds.get(signature.id)));
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
): CsharpTargetConversionOperatorFact {
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
  providerSourceSignatureId: string | undefined,
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
    ...(providerSourceSignatureId !== undefined ? { providerSourceSignatureId } : {}),
  };
}

function dotnetParameterToTargetParameter(parameter: DotnetParameterDeclaration): DotnetTargetParameter {
  return {
    name: parameter.name,
    type: dotnetTypeRefToTargetTypeRef(parameter.type),
    passingMode: parameter.passingMode,
    ...(parameter.sourceType !== undefined || dotnetParameterTypeHasSourceProjection(parameter.type)
      ? { csharpAcceptsCheckedSourceArgument: true as const }
      : {}),
    ...(parameter.optional === true ? { optional: true } : {}),
    ...(parameter.optional === true ? { csharpOmittableOptionalArgument: true as const } : {}),
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

function dotnetParameterTypeHasSourceProjection(type: DotnetTypeRef): boolean {
  switch (type.kind) {
    case "named":
    case "opaque":
      return type.sourceShape !== undefined;
    case "nullable":
    case "nullable-reference":
      return dotnetParameterTypeHasSourceProjection(type.elementType);
    case "array":
      return dotnetParameterTypeHasSourceProjection(type.elementType);
    case "tuple":
      return type.elements.some(dotnetParameterTypeHasSourceProjection);
    case "union":
      return type.types.some(dotnetParameterTypeHasSourceProjection);
    case "function":
      return type.parameters.some((parameter) => dotnetParameterTypeHasSourceProjection(parameter.sourceType ?? parameter.type)) ||
        dotnetParameterTypeHasSourceProjection(type.returnType);
    case "object":
      return true;
    case "void":
    case "any":
    case "unknown":
    case "undefined":
    case "string":
    case "literal":
    case "boolean":
    case "number":
    case "bigint":
    case "source-primitive":
    case "type-parameter":
    case "provider-ref":
    case "pointer":
    case "function-pointer":
      return false;
  }
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
