import {
  AsNewExpression,
  AsPropertyAccessExpression,
  HasSourceKind,
  KindNewExpression,
  KindPropertyAccessExpression,
} from "./source-ast.js";
import type {
  Node,
  SelectedTargetSignatureFact,
  SourceFile,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import { getTargetTypeRefForNode } from "./runtime-carriers.js";

export function instantiateSelectedTargetMember(
  operationNode: Node,
  callee: Node | undefined,
  selectedSignature: SelectedTargetSignatureFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): TargetMember {
  const member = selectedSignature.member;
  const explicitTypeArgumentMap = getExplicitSelectedTargetTypeArgumentMap(member, operationNode, sourceFile, input);
  if (explicitTypeArgumentMap.size > 0) {
    return substituteTargetMemberTypeParameters(member, explicitTypeArgumentMap);
  }
  const propertyAccess = HasSourceKind(input.ast, callee, KindPropertyAccessExpression)
    ? AsPropertyAccessExpression(callee)
    : undefined;
  const typeSubject = propertyAccess?.Expression ?? operationNode;
  const bindingSubject = propertyAccess?.Expression ?? callee ?? operationNode;
  const carrier = getTargetTypeRefForNode(input, typeSubject, sourceFile);
  const binding = input.semantics.getTargetBindingForReference(bindingSubject, { sourceFile });
  const selectedTypeArgumentMap = getSelectedTargetTypeArgumentMap(member, binding?.typeParameters ?? [], selectedSignature.targetTypeArguments ?? []);
  if (selectedTypeArgumentMap.size > 0) {
    return substituteTargetMemberTypeParameters(member, selectedTypeArgumentMap);
  }
  if (carrier?.kind !== "target-named" || (carrier.typeArguments ?? []).length === 0) {
    return member;
  }
  const typeParameters = member.typeParameters ?? binding?.typeParameters ?? [];
  if (typeParameters.length === 0) {
    return member;
  }
  const typeArgumentMap = new Map<string, TargetTypeRef>();
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = carrier.typeArguments?.[index];
    if (parameter !== undefined && argument !== undefined) {
      typeArgumentMap.set(parameter.name, argument);
    }
  }
  if (typeArgumentMap.size === 0) {
    return member;
  }
  return substituteTargetMemberTypeParameters(member, typeArgumentMap);
}

function getSelectedTargetTypeArgumentMap(
  member: TargetMember,
  bindingTypeParameters: readonly { readonly name: string }[],
  targetTypeArguments: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> {
  if (targetTypeArguments.length === 0) {
    return new Map();
  }
  const typeParameters = getTargetMemberTypeParameters(member, bindingTypeParameters);
  return typeParameters.length === 0 ? new Map() : buildTargetTypeArgumentMap(typeParameters, targetTypeArguments);
}

function getExplicitSelectedTargetTypeArgumentMap(
  member: TargetMember,
  operationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReadonlyMap<string, TargetTypeRef> {
  const newExpression = HasSourceKind(input.ast, operationNode, KindNewExpression)
    ? AsNewExpression(operationNode)
    : undefined;
  if (newExpression?.Expression === undefined) {
    return new Map();
  }
  const binding = input.semantics.getTargetBindingForReference(newExpression.Expression, { sourceFile });
  const typeParameters = getTargetMemberTypeParameters(member, binding?.typeParameters ?? []);
  if (typeParameters.length === 0) {
    return new Map();
  }
  const typeArguments = input.ast.typeArguments(newExpression)
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument) => getTargetTypeRefForNode(input, argument, sourceFile));
  if (typeArguments.length === 0 || typeArguments.some((argument) => argument === undefined)) {
    return new Map();
  }
  return buildTargetTypeArgumentMap(typeParameters, typeArguments as readonly TargetTypeRef[]);
}

function getTargetMemberTypeParameters(
  member: TargetMember,
  bindingTypeParameters: readonly { readonly name: string }[],
): readonly { readonly name: string }[] {
  if (member.typeParameters !== undefined && member.typeParameters.length > 0) {
    return member.typeParameters;
  }
  if (bindingTypeParameters.length > 0) {
    return bindingTypeParameters;
  }
  return collectTargetTypeParameterNamesFromMember(member).map((name) => ({ name }));
}

function collectTargetTypeParameterNamesFromMember(member: TargetMember): readonly string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const visit = (type: TargetTypeRef | undefined): void => {
    if (type === undefined) {
      return;
    }
    switch (type.kind) {
      case "type-parameter":
        if (!seen.has(type.name)) {
          seen.add(type.name);
          names.push(type.name);
        }
        return;
      case "target-named":
        for (const argument of type.typeArguments ?? []) {
          visit(argument);
        }
        return;
      case "array":
        visit(type.element);
        return;
      case "tuple":
        for (const element of type.elements) {
          visit(element);
        }
        return;
      case "pointer":
        visit(type.pointee);
        return;
      case "function-pointer":
        for (const argument of type.args) {
          visit(argument);
        }
        visit(type.result);
        return;
      case "associated-type":
        visit(type.owner);
        return;
      case "source-primitive":
      case "opaque":
      case "lifetime":
      case "target-specific":
        return;
    }
  };
  visit(member.declaringType);
  for (const parameter of member.parameters) {
    visit(parameter.type);
  }
  visit(member.returnType);
  return names;
}

function buildTargetTypeArgumentMap(
  typeParameters: readonly { readonly name: string }[],
  typeArguments: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> {
  const typeArgumentMap = new Map<string, TargetTypeRef>();
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = typeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      typeArgumentMap.set(parameter.name, argument);
    }
  }
  return typeArgumentMap;
}

function substituteTargetMemberTypeParameters(
  member: TargetMember,
  typeArgumentMap: ReadonlyMap<string, TargetTypeRef>,
): TargetMember {
  const declaringType = member.declaringType === undefined
    ? undefined
    : applyDeclaringTypeArguments(substituteTargetTypeRef(member.declaringType, typeArgumentMap), typeArgumentMap);
  return {
    ...member,
    ...(declaringType !== undefined ? { declaringType } : {}),
    parameters: member.parameters.map((parameter) => ({
      ...parameter,
      type: substituteTargetTypeRef(parameter.type, typeArgumentMap),
    })),
    ...(member.returnType !== undefined ? { returnType: substituteTargetTypeRef(member.returnType, typeArgumentMap) } : {}),
  };
}

function applyDeclaringTypeArguments(
  declaringType: TargetTypeRef,
  typeArgumentMap: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  if (declaringType.kind !== "target-named" || (declaringType.typeArguments ?? []).length > 0) {
    return declaringType;
  }
  const arity = getTargetNamedTypeArity(declaringType.id);
  if (arity === 0 || typeArgumentMap.size < arity) {
    return declaringType;
  }
  return {
    ...declaringType,
    typeArguments: [...typeArgumentMap.values()].slice(0, arity),
  };
}

function getTargetNamedTypeArity(id: string): number {
  const tick = id.lastIndexOf("`");
  if (tick < 0) {
    return 0;
  }
  const parsed = Number.parseInt(id.slice(tick + 1), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function substituteTargetTypeRef(type: TargetTypeRef, typeArgumentMap: ReadonlyMap<string, TargetTypeRef>): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return typeArgumentMap.get(type.name) ?? type;
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments !== undefined
          ? { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeRef(argument, typeArgumentMap)) }
          : {}),
      };
    case "array":
      return { ...type, element: substituteTargetTypeRef(type.element, typeArgumentMap) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeRef(element, typeArgumentMap)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeRef(type.pointee, typeArgumentMap) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeRef(argument, typeArgumentMap)),
        result: substituteTargetTypeRef(type.result, typeArgumentMap),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeRef(type.owner, typeArgumentMap) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}
