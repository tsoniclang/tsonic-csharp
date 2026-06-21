import type {
  Node,
  SelectedTargetSignatureFact,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";

export function instantiateSelectedTargetMember(
  operationNode: Node,
  selectedSignature: SelectedTargetSignatureFact,
  diagnostics: TargetDiagnostic[],
): TargetMember | undefined {
  const member = selectedSignature.member;
  const selectedTypeArgumentMap = getSelectedTargetTypeArgumentMap(member, selectedSignature.targetTypeArguments ?? []);
  const instantiated = selectedTypeArgumentMap.size > 0
    ? substituteTargetMemberTypeParameters(member, selectedTypeArgumentMap)
    : member;
  const unresolved = collectTargetTypeParameterNamesFromMember(instantiated);
  if (unresolved.length > 0) {
    diagnostics.push(unsupportedNodeDiagnostic(
      operationNode,
      `Selected target member '${member.id}' requires finalized target type arguments for ${unresolved.join(", ")} before C# emission.`,
    ));
    return undefined;
  }
  return instantiated;
}

function getSelectedTargetTypeArgumentMap(
  member: TargetMember,
  targetTypeArguments: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> {
  if (targetTypeArguments.length === 0) {
    return new Map();
  }
  const typeParameters = getTargetMemberTypeParameters(member);
  return typeParameters.length === 0 ? new Map() : buildTargetTypeArgumentMap(typeParameters, targetTypeArguments);
}

function getTargetMemberTypeParameters(
  member: TargetMember,
): readonly { readonly name: string }[] {
  if (member.typeParameters !== undefined && member.typeParameters.length > 0) {
    return member.typeParameters;
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
