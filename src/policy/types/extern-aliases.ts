import type {
  TargetBindingFact,
  TargetConstraint,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "./definitions.js";
import type {
  CsharpDelegateSignatureShape,
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  CsharpRuntimeUnionTargetTypeRef,
  CsharpTargetAttributeArgument,
  CsharpTargetAttributeFact,
  CsharpTargetAttributeValue,
  CsharpTargetBindingFact,
  CsharpTargetConversionOperatorFact,
  CsharpTargetMember,
  CsharpTargetNamedTypeRef,
  CsharpTargetParameter,
  CsharpTargetTypeParameter,
  CsharpTargetTypeRenderShape,
  CsharpTargetUnsupportedAttributeFact,
  CsharpTaskTargetTypeRef,
} from "./definitions.js";

export interface CsharpExternAliasSpecifier {
  readonly alias: string;
  readonly assemblyName: string;
}

export function csharpApplyExternAliasToTargetBinding(
  binding: TargetBindingFact,
  specifier: CsharpExternAliasSpecifier,
): TargetBindingFact {
  const csharpBinding = binding as CsharpTargetBindingFact;
  return {
    ...csharpBinding,
    ...(csharpBinding.csharpType !== undefined ? { csharpType: csharpApplyExternAliasToTargetType(csharpBinding.csharpType, specifier) } : {}),
    ...(csharpBinding.csharpBaseType !== undefined ? { csharpBaseType: csharpApplyExternAliasToTargetType(csharpBinding.csharpBaseType, specifier) } : {}),
    ...(csharpBinding.csharpRender !== undefined ? { csharpRender: csharpApplyExternAliasToRenderShape(csharpBinding.csharpRender, csharpBinding.id, specifier) } : {}),
    ...(csharpBinding.typeParameters !== undefined ? { typeParameters: csharpBinding.typeParameters.map((parameter) => csharpApplyExternAliasToTypeParameter(parameter, specifier)) } : {}),
    ...(csharpBinding.members !== undefined ? { members: csharpBinding.members.map((member) => csharpApplyExternAliasToTargetMember(member, specifier)) } : {}),
    ...(csharpBinding.implementedContracts !== undefined ? { implementedContracts: csharpBinding.implementedContracts.map((constraint) => csharpApplyExternAliasToConstraint(constraint, specifier)) } : {}),
    ...(csharpBinding.attributes !== undefined ? { attributes: csharpBinding.attributes.map((attribute) => csharpApplyExternAliasToAttribute(attribute, specifier)) } : {}),
    ...(csharpBinding.unsupportedAttributes !== undefined ? { unsupportedAttributes: csharpBinding.unsupportedAttributes.map((attribute) => csharpApplyExternAliasToUnsupportedAttribute(attribute, specifier)) } : {}),
    ...(csharpBinding.conversionOperators !== undefined ? { conversionOperators: csharpBinding.conversionOperators.map((operator) => csharpApplyExternAliasToConversionOperator(operator, specifier)) } : {}),
  };
}

export function csharpApplyExternAliasToTargetType(
  type: TargetTypeRef,
  specifier: CsharpExternAliasSpecifier,
): TargetTypeRef {
  switch (type.kind) {
    case "source-global":
      return {
        ...type,
        ...(type.typeArguments === undefined
          ? {}
          : { typeArguments: type.typeArguments.map((argument) => csharpApplyExternAliasToTargetType(argument, specifier)) }),
      };
    case "target-named":
      return csharpApplyExternAliasToNamedTargetType(type, specifier);
    case "array":
      return {
        ...type,
        element: csharpApplyExternAliasToTargetType(type.element, specifier),
      };
    case "tuple":
      return {
        ...type,
        elements: type.elements.map((element) => csharpApplyExternAliasToTargetType(element, specifier)),
      };
    case "pointer":
      return {
        ...type,
        pointee: csharpApplyExternAliasToTargetType(type.pointee, specifier),
      };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => csharpApplyExternAliasToTargetType(argument, specifier)),
        result: csharpApplyExternAliasToTargetType(type.result, specifier),
      };
    case "associated-type":
      return {
        ...type,
        owner: csharpApplyExternAliasToTargetType(type.owner, specifier),
      };
    case "source-primitive":
    case "type-parameter":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}

function csharpApplyExternAliasToNamedTargetType(
  type: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  specifier: CsharpExternAliasSpecifier,
): TargetTypeRef {
  const csharpType = type as CsharpTargetNamedTypeRef &
    Partial<CsharpTaskTargetTypeRef> &
    Partial<CsharpRuntimeUnionTargetTypeRef>;
  const mappedDelegateSignature = csharpType.csharpDelegateSignature === undefined
    ? undefined
    : csharpApplyExternAliasToDelegateSignature(csharpType.csharpDelegateSignature, specifier);
  return {
    ...csharpType,
    ...(csharpType.typeArguments !== undefined
      ? { typeArguments: csharpType.typeArguments.map((argument) => csharpApplyExternAliasToTargetType(argument, specifier)) }
      : {}),
    ...(csharpType.csharpRender !== undefined
      ? { csharpRender: csharpApplyExternAliasToRenderShape(csharpType.csharpRender, csharpType.id, specifier) }
      : {}),
    ...(csharpType.csharpBaseType !== undefined ? { csharpBaseType: csharpApplyExternAliasToTargetType(csharpType.csharpBaseType, specifier) } : {}),
    ...(csharpType.csharpArrayLiteralElementType !== undefined ? { csharpArrayLiteralElementType: csharpApplyExternAliasToTargetType(csharpType.csharpArrayLiteralElementType, specifier) } : {}),
    ...(csharpType.csharpArrayLiteralConstructionType !== undefined ? { csharpArrayLiteralConstructionType: csharpApplyExternAliasToTargetType(csharpType.csharpArrayLiteralConstructionType, specifier) } : {}),
    ...(csharpType.csharpImplicitArrayInputElementType !== undefined ? { csharpImplicitArrayInputElementType: csharpApplyExternAliasToTargetType(csharpType.csharpImplicitArrayInputElementType, specifier) } : {}),
    ...(csharpType.csharpEnumerableElementType !== undefined ? { csharpEnumerableElementType: csharpApplyExternAliasToTargetType(csharpType.csharpEnumerableElementType, specifier) } : {}),
    ...(csharpType.csharpReadOnlyIndexableElementType !== undefined ? { csharpReadOnlyIndexableElementType: csharpApplyExternAliasToTargetType(csharpType.csharpReadOnlyIndexableElementType, specifier) } : {}),
    ...(csharpType.csharpDenseMutableElementType !== undefined ? { csharpDenseMutableElementType: csharpApplyExternAliasToTargetType(csharpType.csharpDenseMutableElementType, specifier) } : {}),
    ...(mappedDelegateSignature !== undefined ? { csharpDelegateSignature: mappedDelegateSignature } : {}),
    ...(csharpType.csharpTaskResultType !== undefined ? { csharpTaskResultType: csharpApplyExternAliasToTargetType(csharpType.csharpTaskResultType, specifier) } : {}),
    ...(csharpType.csharpRuntimeUnionArms !== undefined ? { csharpRuntimeUnionArms: csharpType.csharpRuntimeUnionArms.map((arm) => csharpApplyExternAliasToTargetType(arm, specifier)) } : {}),
    ...(csharpType.csharpRuntimeUnionObjectShapes !== undefined
      ? { csharpRuntimeUnionObjectShapes: csharpType.csharpRuntimeUnionObjectShapes.map((shape) => shape === undefined ? undefined : csharpApplyExternAliasToObjectShape(shape, specifier)) }
      : {}),
  };
}

function csharpApplyExternAliasToRenderShape(
  shape: CsharpTargetTypeRenderShape,
  targetId: string,
  specifier: CsharpExternAliasSpecifier,
): CsharpTargetTypeRenderShape {
  return shape.kind === "named" && targetIdAssemblySimpleName(targetId) === specifier.assemblyName
    ? {
        ...shape,
        externAlias: specifier.alias,
      }
    : shape;
}

function csharpApplyExternAliasToTypeParameter(
  parameter: CsharpTargetTypeParameter,
  specifier: CsharpExternAliasSpecifier,
): CsharpTargetTypeParameter {
  return {
    ...parameter,
    ...(parameter.constraints !== undefined ? { constraints: parameter.constraints.map((constraint) => csharpApplyExternAliasToConstraint(constraint, specifier)) } : {}),
  };
}

function csharpApplyExternAliasToConstraint(
  constraint: TargetConstraint,
  specifier: CsharpExternAliasSpecifier,
): TargetConstraint {
  return constraint.kind === "implements" && constraint.typeArguments !== undefined
    ? {
        ...constraint,
        typeArguments: constraint.typeArguments.map((argument) => csharpApplyExternAliasToTargetType(argument, specifier)),
      }
    : constraint;
}

function csharpApplyExternAliasToTargetMember(
  member: TargetMember,
  specifier: CsharpExternAliasSpecifier,
): TargetMember {
  const csharpMember = member as CsharpTargetMember;
  return {
    ...csharpMember,
    parameters: csharpMember.parameters.map((parameter) => csharpApplyExternAliasToParameter(parameter, specifier)),
    ...(csharpMember.returnType !== undefined ? { returnType: csharpApplyExternAliasToTargetType(csharpMember.returnType, specifier) } : {}),
    ...(csharpMember.typeParameters !== undefined ? { typeParameters: csharpMember.typeParameters.map((parameter) => csharpApplyExternAliasToTypeParameter(parameter, specifier)) } : {}),
    ...(csharpMember.declaringType !== undefined ? { declaringType: csharpApplyExternAliasToTargetType(csharpMember.declaringType, specifier) } : {}),
    ...(csharpMember.attributes !== undefined ? { attributes: csharpMember.attributes.map((attribute) => csharpApplyExternAliasToAttribute(attribute, specifier)) } : {}),
    ...(csharpMember.unsupportedAttributes !== undefined ? { unsupportedAttributes: csharpMember.unsupportedAttributes.map((attribute) => csharpApplyExternAliasToUnsupportedAttribute(attribute, specifier)) } : {}),
    ...(csharpMember.returnAttributes !== undefined ? { returnAttributes: csharpMember.returnAttributes.map((attribute) => csharpApplyExternAliasToAttribute(attribute, specifier)) } : {}),
    ...(csharpMember.unsupportedReturnAttributes !== undefined ? { unsupportedReturnAttributes: csharpMember.unsupportedReturnAttributes.map((attribute) => csharpApplyExternAliasToUnsupportedAttribute(attribute, specifier)) } : {}),
  };
}

function csharpApplyExternAliasToParameter(
  parameter: TargetParameter,
  specifier: CsharpExternAliasSpecifier,
): TargetParameter {
  const csharpParameter = parameter as CsharpTargetParameter;
  return {
    ...csharpParameter,
    type: csharpApplyExternAliasToTargetType(csharpParameter.type, specifier),
    ...(csharpParameter.attributes !== undefined ? { attributes: csharpParameter.attributes.map((attribute) => csharpApplyExternAliasToAttribute(attribute, specifier)) } : {}),
    ...(csharpParameter.unsupportedAttributes !== undefined ? { unsupportedAttributes: csharpParameter.unsupportedAttributes.map((attribute) => csharpApplyExternAliasToUnsupportedAttribute(attribute, specifier)) } : {}),
  };
}

function csharpApplyExternAliasToAttribute(
  attribute: CsharpTargetAttributeFact,
  specifier: CsharpExternAliasSpecifier,
): CsharpTargetAttributeFact {
  return {
    ...attribute,
    attributeType: csharpApplyExternAliasToTargetType(attribute.attributeType, specifier),
    ...(attribute.arguments !== undefined ? { arguments: attribute.arguments.map((argument) => csharpApplyExternAliasToAttributeArgument(argument, specifier)) } : {}),
  };
}

function csharpApplyExternAliasToUnsupportedAttribute(
  attribute: CsharpTargetUnsupportedAttributeFact,
  specifier: CsharpExternAliasSpecifier,
): CsharpTargetUnsupportedAttributeFact {
  return {
    ...attribute,
    ...(attribute.attributeType !== undefined ? { attributeType: csharpApplyExternAliasToTargetType(attribute.attributeType, specifier) } : {}),
  };
}

function csharpApplyExternAliasToAttributeArgument(
  argument: CsharpTargetAttributeArgument,
  specifier: CsharpExternAliasSpecifier,
): CsharpTargetAttributeArgument {
  return {
    ...argument,
    value: csharpApplyExternAliasToAttributeValue(argument.value, specifier),
  };
}

function csharpApplyExternAliasToAttributeValue(
  value: CsharpTargetAttributeValue,
  specifier: CsharpExternAliasSpecifier,
): CsharpTargetAttributeValue {
  switch (value.kind) {
    case "type":
      return {
        ...value,
        type: csharpApplyExternAliasToTargetType(value.type, specifier),
      };
    case "enum":
      return {
        ...value,
        type: csharpApplyExternAliasToTargetType(value.type, specifier),
      };
    case "array":
      return {
        ...value,
        elements: value.elements.map((element) => csharpApplyExternAliasToAttributeValue(element, specifier)),
      };
    default:
      return value;
  }
}

function csharpApplyExternAliasToConversionOperator(
  operator: CsharpTargetConversionOperatorFact,
  specifier: CsharpExternAliasSpecifier,
): CsharpTargetConversionOperatorFact {
  return {
    ...operator,
    declaringType: csharpApplyExternAliasToTargetType(operator.declaringType, specifier),
    sourceType: csharpApplyExternAliasToTargetType(operator.sourceType, specifier),
    targetType: csharpApplyExternAliasToTargetType(operator.targetType, specifier),
  };
}

function csharpApplyExternAliasToDelegateSignature(
  signature: CsharpDelegateSignatureShape,
  specifier: CsharpExternAliasSpecifier,
): CsharpDelegateSignatureShape {
  return {
    parameters: signature.parameters.map((parameter) => csharpApplyExternAliasToTargetType(parameter, specifier)),
    returnType: csharpApplyExternAliasToTargetType(signature.returnType, specifier),
    ...(signature.optionalParameterIndexes === undefined
      ? {}
      : { optionalParameterIndexes: signature.optionalParameterIndexes }),
  };
}

function csharpApplyExternAliasToObjectShape(
  shape: CsharpObjectShapeFact,
  specifier: CsharpExternAliasSpecifier,
): CsharpObjectShapeFact {
  return {
    ...shape,
    targetType: csharpApplyExternAliasToTargetType(shape.targetType, specifier),
    members: shape.members.map((member) => csharpApplyExternAliasToObjectShapeMember(member, specifier)),
    ...(shape.implements !== undefined ? { implements: shape.implements.map((contract) => csharpApplyExternAliasToTargetType(contract, specifier)) } : {}),
  };
}

function csharpApplyExternAliasToObjectShapeMember(
  member: CsharpObjectShapeMemberFact,
  specifier: CsharpExternAliasSpecifier,
): CsharpObjectShapeMemberFact {
  return {
    ...member,
    type: csharpApplyExternAliasToTargetType(member.type, specifier),
  };
}

function targetIdAssemblySimpleName(targetId: string): string | undefined {
  const separator = targetId.indexOf("::");
  if (separator <= 0) {
    return undefined;
  }
  return targetId.slice(0, separator).split(",")[0];
}
