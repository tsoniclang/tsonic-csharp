import type {
  TargetConstraint,
  TargetAttributeArgument,
  TargetAttributeFact,
  TargetAttributeValue,
  TargetBindingFact,
  TargetMember,
  TargetConversionOperatorFact,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
  TargetUnsupportedAttributeFact,
} from "@tsonic/tsts";
import type {
  DotnetAttributeArgument,
  DotnetAttributeDeclaration,
  DotnetAttributeValue,
  DotnetConstraint,
  DotnetConversionOperatorDeclaration,
  DotnetExportDeclaration,
  DotnetMemberDeclaration,
  DotnetParameterDeclaration,
  DotnetParameterDefaultValue,
  DotnetRenderShape,
  DotnetSignatureDeclaration,
  DotnetTypeDeclaration,
  DotnetTypeKind,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
  DotnetUnsupportedAttributeDeclaration,
  DotnetUnsupportedConstraintDeclaration,
  DotnetUnsupportedDefaultValueDeclaration,
  DotnetUnsupportedMemberDeclaration,
} from "./model-types.js";
import {
  type CsharpTargetBindingFact,
  csharpBigIntegerTargetType,
  csharpBooleanTargetType,
  csharpDelegateTargetType,
  csharpNullableValueTargetType,
  type CsharpTargetTypeRenderShape,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
} from "../../source/csharp-source-semantics/target-types.js";

export type DotnetTargetParameter = TargetParameter & {
  readonly defaultValue?: DotnetParameterDefaultValue;
  readonly unsupportedDefaultValue?: DotnetUnsupportedDefaultValueDeclaration;
};

export type DotnetTargetTypeParameter = TargetTypeParameter & {
  readonly unsupportedConstraints?: readonly DotnetUnsupportedConstraintDeclaration[];
};

export type DotnetTargetMember = TargetMember & {
  readonly parameters: readonly DotnetTargetParameter[];
  readonly typeParameters?: readonly DotnetTargetTypeParameter[];
};

export type DotnetTargetBindingFact = CsharpTargetBindingFact & {
  readonly typeParameters?: readonly DotnetTargetTypeParameter[];
  readonly members?: readonly DotnetTargetMember[];
  readonly unsupportedImplementedContracts?: readonly DotnetUnsupportedConstraintDeclaration[];
  readonly unsupportedMembers?: readonly DotnetUnsupportedMemberDeclaration[];
};

export function dotnetConstraintToTargetConstraint(constraint: DotnetConstraint): TargetConstraint {
  switch (constraint.kind) {
    case "implements": {
      const contract = dotnetTypeRefToTargetTypeRef(constraint.contract);
      if (contract.kind !== "target-named") {
        throw new Error(`Unsupported .NET target constraint 'implements' for non-named contract '${contract.kind}'. Add a typed TSTS target constraint before exposing this declaration.`);
      }
      return {
        kind: "implements",
        contract: contract.id,
        ...(contract.typeArguments !== undefined ? { typeArguments: contract.typeArguments } : {}),
      };
    }
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
      return { kind: constraint.kind };
    case "not-null":
      throw new Error("Unsupported .NET target constraint 'not-null'. Add a typed TSTS target constraint before exposing this declaration.");
    case "target-specific":
      throw new Error(`Unsupported .NET target-specific constraint '${constraint.name}'. Add a typed TSTS target constraint before exposing this declaration.`);
  }
}

export function dotnetExportToTargetBinding(declaration: DotnetExportDeclaration): TargetBindingFact | undefined {
  return declaration.kind === "type" ? dotnetTypeToTargetBinding(declaration) : undefined;
}

function dotnetTypeToTargetBinding(declaration: DotnetTypeDeclaration): TargetBindingFact {
  const targetId = requireDotnetTargetId(declaration.targetId, declaration.metadataName);
  const declaredCsharpType = csharpTargetNamedType(
    targetId,
    declaration.typeParameters?.map((parameter) => ({ kind: "type-parameter", name: parameter.name }) satisfies TargetTypeRef),
    declaration.renderShape === undefined ? undefined : dotnetRenderShapeToCsharpRenderShape(declaration.renderShape),
    csharpTargetMetadataFromDotnetTypeDeclaration(declaration),
  );
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

function dotnetTypeParameterToTargetTypeParameter(parameter: DotnetTypeParameterDeclaration): DotnetTargetTypeParameter {
  return {
    name: parameter.name,
    ...(parameter.constraints !== undefined && parameter.constraints.length > 0
      ? { constraints: parameter.constraints.map(dotnetConstraintToTargetConstraint) }
      : {}),
    ...(parameter.unsupportedConstraints !== undefined && parameter.unsupportedConstraints.length > 0
      ? { unsupportedConstraints: parameter.unsupportedConstraints }
      : {}),
    ...(parameter.variance !== undefined ? { variance: parameter.variance } : {}),
  };
}

function dotnetMemberToTargetMembers(member: DotnetMemberDeclaration, declaringType: TargetTypeRef): readonly TargetMember[] {
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
    ...(signature.returnType !== undefined ? { returnType: dotnetTypeRefToTargetTypeRef(signature.returnType) } : {}),
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

function dotnetMemberIsReadonly(member: DotnetMemberDeclaration): boolean {
  return (member.kind === "property" || member.kind === "field" || member.kind === "indexer") && member.writable !== true;
}

function dotnetTargetMemberOverloadGroup(member: DotnetMemberDeclaration): string {
  return member.kind === "constructor"
    ? dotnetMetadataNameWithoutSignature(member.targetId)
    : member.targetId;
}

function dotnetConversionOperatorToTargetConversionOperator(
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

function dotnetMetadataNameWithoutSignature(metadataName: string): string {
  const signatureStart = metadataName.indexOf("(");
  return signatureStart === -1 ? metadataName : metadataName.slice(0, signatureStart);
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

function dotnetAttributeToTargetAttribute(attribute: DotnetAttributeDeclaration): TargetAttributeFact {
  return {
    id: attribute.id,
    target: attribute.target,
    attributeType: dotnetTypeRefToTargetTypeRef(attribute.attributeType),
    constructorId: attribute.constructorId,
    ...(attribute.arguments !== undefined && attribute.arguments.length > 0
      ? { arguments: attribute.arguments.map(dotnetAttributeArgumentToTargetAttributeArgument) }
      : {}),
    ...(attribute.evidence !== undefined ? { evidence: attribute.evidence } : {}),
  };
}

function dotnetUnsupportedAttributeToTargetUnsupportedAttribute(attribute: DotnetUnsupportedAttributeDeclaration): TargetUnsupportedAttributeFact {
  return {
    id: attribute.id,
    target: attribute.target,
    ...(attribute.attributeType !== undefined && attribute.attributeType !== null ? { attributeType: dotnetTypeRefToTargetTypeRef(attribute.attributeType) } : {}),
    ...(attribute.constructorId !== undefined ? { constructorId: attribute.constructorId } : {}),
    reason: attribute.reason,
    ...(attribute.evidence !== undefined ? { evidence: attribute.evidence } : {}),
  };
}

function dotnetAttributeArgumentToTargetAttributeArgument(argument: DotnetAttributeArgument): TargetAttributeArgument {
  switch (argument.kind) {
    case "constructor":
      return { kind: "constructor", value: dotnetAttributeValueToTargetAttributeValue(argument.value) };
    case "named":
      return {
        kind: "named",
        name: argument.name,
        memberKind: argument.memberKind,
        value: dotnetAttributeValueToTargetAttributeValue(argument.value),
      };
  }
}

function dotnetAttributeValueToTargetAttributeValue(value: DotnetAttributeValue): TargetAttributeValue {
  switch (value.kind) {
    case "null":
    case "string":
      return value;
    case "source-primitive":
      return value;
    case "type":
      return { kind: "type", type: dotnetTypeRefToTargetTypeRef(value.type) };
    case "enum":
      return {
        kind: "enum",
        type: dotnetTypeRefToTargetTypeRef(value.type),
        value: value.value,
        ...(value.fieldName !== undefined ? { fieldName: value.fieldName } : {}),
      };
    case "array":
      return { kind: "array", elements: value.elements.map(dotnetAttributeValueToTargetAttributeValue) };
  }
}

export function dotnetTypeRefToTargetTypeRef(type: DotnetTypeRef): TargetTypeRef {
  switch (type.kind) {
    case "void":
      return csharpVoidTargetType();
    case "any":
    case "unknown":
      return { kind: "opaque", id: type.kind };
    case "object":
      return csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
    case "string":
      return csharpStringTargetType();
    case "literal":
      throw new Error("Literal is a source declaration shape only and cannot be emitted as a target type.");
    case "boolean":
      return csharpBooleanTargetType();
    case "number":
      return csharpTargetNamedType("System.Double", undefined, { kind: "predefined", name: "double" });
    case "bigint":
      return csharpBigIntegerTargetType();
    case "source-primitive":
      return { kind: "source-primitive", name: type.name };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "provider-ref":
      throw new Error("Provider-ref is a source declaration shape only and cannot be emitted as a target type.");
    case "named":
      const targetId = requireDotnetTargetId(type.targetId, type.metadataName);
      return csharpTargetNamedType(
        targetId,
        type.typeArguments?.map(dotnetTypeRefToTargetTypeRef),
        type.renderShape === undefined ? undefined : dotnetRenderShapeToCsharpRenderShape(type.renderShape),
        csharpTargetMetadataFromDotnetTypeRef(type),
      );
    case "array":
      return {
        kind: "array",
        element: dotnetTypeRefToTargetTypeRef(type.elementType),
        ...(type.rank !== undefined ? { rank: type.rank } : {}),
      };
    case "nullable":
      return csharpNullableValueTargetType(dotnetTypeRefToTargetTypeRef(type.elementType));
    case "tuple":
      return { kind: "tuple", elements: type.elements.map(dotnetTypeRefToTargetTypeRef) };
    case "union":
      throw new Error("Unsupported .NET union target type. Add a typed TSTS target union/carrier model before exposing this declaration.");
    case "function":
      return type.returnType.kind === "void"
        ? csharpDelegateTargetType(
            "System.Action",
            type.parameters.map((parameter) => dotnetTypeRefToTargetTypeRef(parameter.type)),
          )
        : csharpDelegateTargetType(
            "System.Func",
            type.parameters.map((parameter) => dotnetTypeRefToTargetTypeRef(parameter.type)),
            dotnetTypeRefToTargetTypeRef(type.returnType),
          );
    case "pointer":
      return { kind: "pointer", pointee: dotnetTypeRefToTargetTypeRef(type.pointee), mutability: type.mutability };
    case "function-pointer":
      return {
        kind: "function-pointer",
        args: type.args.map(dotnetTypeRefToTargetTypeRef),
        result: dotnetTypeRefToTargetTypeRef(type.result),
        ...(type.abi !== undefined ? { abi: type.abi } : {}),
      };
    case "opaque":
      return { kind: "opaque", id: type.id };
  }
}

function requireDotnetTargetId(targetId: string | undefined, metadataName: string): string {
  if (typeof targetId !== "string" || targetId.length === 0) {
    throw new Error(`Missing canonical .NET targetId for '${metadataName}'. .NET target facts must be assembly-qualified and must not fall back to metadataName.`);
  }
  return targetId;
}

function csharpTargetMetadataFromDotnetTypeRef(
  type: Extract<DotnetTypeRef, { readonly kind: "named" }>,
): Parameters<typeof csharpTargetNamedType>[3] {
  const sourceShape = type.sourceShape;
  if (sourceShape?.kind !== "array") {
    return {};
  }
  const elementType = type.typeArguments?.length === 1
    ? type.typeArguments[0]
    : sourceShape.elementType;
  if (elementType === undefined) {
    return {};
  }
  return {
    arrayLiteralElementType: dotnetTypeRefToTargetTypeRef(elementType),
  };
}

function csharpTargetMetadataFromDotnetTypeDeclaration(
  declaration: DotnetTypeDeclaration,
): Parameters<typeof csharpTargetNamedType>[3] {
  return {
    ...(declaration.typeKind === "struct" || declaration.typeKind === "enum" ? { valueType: true as const } : {}),
    ...(declaration.typeKind === "class" || declaration.typeKind === "interface" || declaration.typeKind === "enum"
      ? { sourceDeclarationKind: declaration.typeKind }
      : {}),
    ...(declaration.throwable === true ? { throwable: true as const } : {}),
  };
}

function dotnetRenderShapeToCsharpRenderShape(shape: DotnetRenderShape): CsharpTargetTypeRenderShape {
  switch (shape.kind) {
    case "named":
      return {
        kind: "named",
        ...(shape.namespace !== undefined && shape.namespace.length > 0 ? { namespace: shape.namespace } : {}),
        name: shape.name,
      };
  }
}
