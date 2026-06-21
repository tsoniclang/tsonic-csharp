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
  const selectedTypeArgumentMap = getSelectedTargetTypeArgumentMap(operationNode, member, selectedSignature.targetTypeArguments ?? [], diagnostics);
  if (selectedTypeArgumentMap === undefined) {
    return undefined;
  }
  const instantiated = selectedTypeArgumentMap.size > 0
    ? substituteTargetMemberTypeParameters(member, selectedTypeArgumentMap)
    : member;
  const unresolved = collectUnresolvedTargetTypeRefsFromMember(instantiated);
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
  operationNode: Node,
  member: TargetMember,
  targetTypeArguments: readonly TargetTypeRef[],
  diagnostics: TargetDiagnostic[],
): ReadonlyMap<string, TargetTypeRef> | undefined {
  if (targetTypeArguments.length === 0) {
    return new Map();
  }
  const typeParameters = member.typeParameters ?? [];
  if (typeParameters.length === 0) {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `Selected target member '${member.id}' supplied target type arguments, but the provider member declaration has no target type parameters.`));
    return undefined;
  }
  if (typeParameters.length !== targetTypeArguments.length) {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `Selected target member '${member.id}' supplied ${targetTypeArguments.length} target type argument(s), but the provider member declaration requires ${typeParameters.length}.`));
    return undefined;
  }
  return buildTargetTypeArgumentMap(typeParameters, targetTypeArguments);
}

function collectUnresolvedTargetTypeRefsFromMember(member: TargetMember): readonly string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (name: string): void => {
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  };
  const visit = (type: TargetTypeRef | undefined): void => {
    if (type === undefined) {
      return;
    }
    switch (type.kind) {
      case "type-parameter":
        add(type.name);
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
    : substituteTargetTypeRef(member.declaringType, typeArgumentMap);
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
