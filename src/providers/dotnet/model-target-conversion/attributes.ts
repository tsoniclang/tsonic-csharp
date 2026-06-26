import type {
  TargetAttributeArgument,
  TargetAttributeFact,
  TargetAttributeValue,
  TargetUnsupportedAttributeFact,
} from "@tsonic/tsts";
import type {
  DotnetAttributeArgument,
  DotnetAttributeDeclaration,
  DotnetAttributeValue,
  DotnetUnsupportedAttributeDeclaration,
} from "../model-types.js";
import {
  dotnetTypeRefToTargetTypeRef,
} from "./type-ref.js";

export function dotnetAttributeToTargetAttribute(attribute: DotnetAttributeDeclaration): TargetAttributeFact {
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

export function dotnetUnsupportedAttributeToTargetUnsupportedAttribute(attribute: DotnetUnsupportedAttributeDeclaration): TargetUnsupportedAttributeFact {
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
