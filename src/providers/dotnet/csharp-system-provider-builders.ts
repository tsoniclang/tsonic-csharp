import type {
  DotnetMemberDeclaration,
  DotnetParameterDeclaration,
  DotnetSignatureDeclaration,
  DotnetTypeRef,
} from "./model.js";
import type {
  DotnetProviderDiagnostic,
} from "./provider.js";

export function constructorMember(id: string, parameters: readonly DotnetParameterDeclaration[]): DotnetMemberDeclaration {
  return {
    kind: "constructor",
    sourceName: "constructor",
    targetName: ".ctor",
    metadataName: id,
    signatures: [signature(id, parameters)],
  };
}

export function propertyMember(metadataName: string, sourceName: string, targetName: string, type: DotnetTypeRef): DotnetMemberDeclaration {
  return {
    kind: "property",
    sourceName,
    targetName,
    metadataName,
    type,
  };
}

export function staticPropertyMember(metadataName: string, sourceName: string, targetName: string, type: DotnetTypeRef): DotnetMemberDeclaration {
  return {
    ...propertyMember(metadataName, sourceName, targetName, type),
    static: true,
  };
}

export function indexerMember(
  metadataName: string,
  sourceName: string,
  targetName: string,
  parameters: readonly DotnetParameterDeclaration[],
  returnType: DotnetTypeRef,
): DotnetMemberDeclaration {
  return {
    kind: "indexer",
    sourceName,
    targetName,
    metadataName,
    signatures: [signature(metadataName, parameters, returnType)],
  };
}

export function methodMember(
  metadataName: string,
  sourceName: string,
  targetName: string,
  parameters: readonly DotnetParameterDeclaration[],
  returnType: DotnetTypeRef,
): DotnetMemberDeclaration {
  return {
    kind: "method",
    sourceName,
    targetName,
    metadataName,
    signatures: [signature(metadataName, parameters, returnType)],
  };
}

export function staticMethodMember(
  metadataName: string,
  sourceName: string,
  targetName: string,
  parameters: readonly DotnetParameterDeclaration[],
  returnType: DotnetTypeRef,
): DotnetMemberDeclaration {
  return {
    ...methodMember(metadataName, sourceName, targetName, parameters, returnType),
    static: true,
  };
}

export function signature(
  id: string,
  parameters: readonly DotnetParameterDeclaration[],
  returnType?: DotnetTypeRef,
): DotnetSignatureDeclaration {
  return {
    id,
    parameters,
    ...(returnType !== undefined ? { returnType } : {}),
  };
}

export function parameter(name: string, type: DotnetTypeRef): DotnetParameterDeclaration {
  return {
    name,
    type,
    passingMode: "by-value",
  };
}

export function restParameter(name: string, type: DotnetTypeRef): DotnetParameterDeclaration {
  return {
    name,
    type,
    passingMode: "by-value",
    rest: true,
  };
}

export function namedType(metadataName: string, sourceShape?: DotnetTypeRef): DotnetTypeRef {
  return {
    kind: "named",
    metadataName,
    displayName: metadataName,
    ...(sourceShape !== undefined ? { sourceShape } : {}),
  };
}

export function sourcePrimitiveType(name: "bool" | "uint8" | "int32" | "float64"): DotnetTypeRef;
export function sourcePrimitiveType(name: "bool" | "uint8" | "int32" | "float64"): DotnetTypeRef {
  return {
    kind: "source-primitive",
    name,
  };
}

export function typeParameterType(name: string): DotnetTypeRef {
  return {
    kind: "type-parameter",
    name,
  };
}

export function dotnetProviderDiagnostic(
  code: string,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
): DotnetProviderDiagnostic {
  return {
    code,
    message,
    evidence: [evidence],
  };
}
