import type {
  ProviderDeclarationIdentity,
  TargetConstraint,
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "./target-types.js";

export function targetMemberAsSelection(member: CsharpTargetMember): TargetMember {
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
        ...(type.value === undefined ? {} : { value: type.value }),
      };
  }
}

function targetParameterAsSelection(parameter: CsharpTargetParameter): TargetParameter {
  return {
    name: parameter.name,
    type: targetTypeRefAsSelection(parameter.type),
    passingMode: parameter.passingMode,
    ...(parameter.optional === undefined ? {} : { optional: parameter.optional }),
    ...(parameter.paramsArray === undefined ? {} : { paramsArray: parameter.paramsArray }),
  };
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
        ...(constraint.value === undefined ? {} : { value: constraint.value }),
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
