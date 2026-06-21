import type {
  ArgumentPassingMode,
  ProviderTypeExpression,
  SourcePrimitiveKind,
  TargetConstraint,
  TargetTypeRef,
} from "@tsonic/tsts";

export interface DotnetProviderIdentity {
  readonly id: string;
  readonly version: string;
  readonly target: "csharp";
  readonly displayName: string;
}

export interface DotnetAssemblyReference {
  readonly name: string;
  readonly version?: string;
  readonly publicKeyToken?: string;
  readonly culture?: string;
  readonly path?: string;
}

export interface DotnetModuleModel {
  readonly moduleSpecifier: string;
  readonly namespaceName: string;
  readonly assembly?: DotnetAssemblyReference;
  readonly exports: readonly DotnetExportDeclaration[];
}

export type DotnetExportDeclaration =
  | DotnetTypeDeclaration
  | DotnetFunctionDeclaration
  | DotnetValueDeclaration
  | DotnetNamespaceDeclaration;

export type DotnetTypeKind =
  | "class"
  | "struct"
  | "interface"
  | "enum"
  | "delegate"
  | "opaque";

export interface DotnetTypeDeclaration {
  readonly kind: "type";
  readonly typeKind: DotnetTypeKind;
  readonly sourceName: string;
  readonly namespaceName: string;
  readonly metadataName: string;
  readonly displayName?: string;
  readonly typeParameters?: readonly DotnetTypeParameterDeclaration[];
  readonly implementedContracts?: readonly DotnetConstraint[];
  readonly members?: readonly DotnetMemberDeclaration[];
  readonly sourceShape?: DotnetTypeRef;
}

export interface DotnetNamespaceDeclaration {
  readonly kind: "namespace";
  readonly sourceName: string;
  readonly namespaceName: string;
  readonly exports: readonly DotnetExportDeclaration[];
}

export interface DotnetFunctionDeclaration {
  readonly kind: "function";
  readonly sourceName: string;
  readonly metadataName: string;
  readonly signatures: readonly DotnetSignatureDeclaration[];
}

export interface DotnetValueDeclaration {
  readonly kind: "value";
  readonly sourceName: string;
  readonly metadataName: string;
  readonly type: DotnetTypeRef;
}

export type DotnetMemberKind =
  | "constructor"
  | "method"
  | "property"
  | "field"
  | "indexer"
  | "event"
  | "operator";

export interface DotnetMemberDeclaration {
  readonly kind: DotnetMemberKind;
  readonly sourceName: string;
  readonly targetName: string;
  readonly metadataName: string;
  readonly static?: boolean;
  readonly type?: DotnetTypeRef;
  readonly signatures?: readonly DotnetSignatureDeclaration[];
}

export interface DotnetSignatureDeclaration {
  readonly id: string;
  readonly targetName?: string;
  readonly typeParameters?: readonly DotnetTypeParameterDeclaration[];
  readonly parameters: readonly DotnetParameterDeclaration[];
  readonly returnType?: DotnetTypeRef;
}

export interface DotnetParameterDeclaration {
  readonly name: string;
  readonly type: DotnetTypeRef;
  readonly passingMode: ArgumentPassingMode;
  readonly optional?: boolean;
  readonly rest?: boolean;
}

export interface DotnetTypeParameterDeclaration {
  readonly name: string;
  readonly constraints?: readonly DotnetConstraint[];
  readonly variance?: "in" | "out" | "invariant" | "target-defined";
}

export type DotnetConstraint =
  | { readonly kind: "implements"; readonly contract: DotnetTypeRef }
  | { readonly kind: "value-type" }
  | { readonly kind: "reference-type" }
  | { readonly kind: "constructible" }
  | { readonly kind: "unmanaged" }
  | { readonly kind: "not-null" }
  | { readonly kind: "target-specific"; readonly name: string; readonly value?: unknown };

export type DotnetTypeRef =
  | { readonly kind: "void" }
  | { readonly kind: "any" }
  | { readonly kind: "unknown" }
  | { readonly kind: "object" }
  | { readonly kind: "string" }
  | { readonly kind: "boolean" }
  | { readonly kind: "number" }
  | { readonly kind: "bigint" }
  | { readonly kind: "source-primitive"; readonly name: SourcePrimitiveKind }
  | { readonly kind: "type-parameter"; readonly name: string }
  | { readonly kind: "named"; readonly metadataName: string; readonly displayName?: string; readonly typeArguments?: readonly DotnetTypeRef[]; readonly sourceShape?: DotnetTypeRef }
  | { readonly kind: "array"; readonly elementType: DotnetTypeRef; readonly rank?: number }
  | { readonly kind: "tuple"; readonly elements: readonly DotnetTypeRef[] }
  | { readonly kind: "union"; readonly types: readonly DotnetTypeRef[] }
  | { readonly kind: "function"; readonly parameters: readonly DotnetParameterDeclaration[]; readonly returnType: DotnetTypeRef; readonly typeParameters?: readonly DotnetTypeParameterDeclaration[] }
  | { readonly kind: "pointer"; readonly pointee: DotnetTypeRef; readonly mutability?: "const" | "mut" | "target-defined" }
  | { readonly kind: "function-pointer"; readonly args: readonly DotnetTypeRef[]; readonly result: DotnetTypeRef; readonly abi?: readonly string[] }
  | { readonly kind: "opaque"; readonly id: string; readonly displayName?: string; readonly sourceShape?: DotnetTypeRef };

export function dotnetTypeRefToProviderType(type: DotnetTypeRef): ProviderTypeExpression {
  switch (type.kind) {
    case "void":
    case "any":
    case "unknown":
    case "object":
    case "string":
    case "boolean":
    case "number":
    case "bigint":
      return { kind: type.kind };
    case "source-primitive":
      return { kind: "source-primitive", name: type.name };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "named":
      return {
        kind: "target-named",
        target: "csharp",
        id: type.metadataName,
        ...(type.displayName !== undefined ? { displayName: type.displayName } : {}),
        ...(type.typeArguments !== undefined ? { typeArguments: type.typeArguments.map(dotnetTypeRefToProviderType) } : {}),
        ...(type.sourceShape !== undefined ? { sourceShape: dotnetTypeRefToProviderType(type.sourceShape) } : {}),
      };
    case "array":
      return { kind: "array", elementType: dotnetTypeRefToProviderType(type.elementType) };
    case "tuple":
      return { kind: "tuple", elementTypes: type.elements.map(dotnetTypeRefToProviderType) };
    case "union":
      return { kind: "union", types: type.types.map(dotnetTypeRefToProviderType) };
    case "function":
      return {
        kind: "function",
        parameters: type.parameters.map((parameter) => ({
          name: parameter.name,
          type: dotnetTypeRefToProviderType(parameter.type),
          ...(parameter.optional === true ? { optional: true } : {}),
          ...(parameter.rest === true ? { rest: true } : {}),
        })),
        returnType: dotnetTypeRefToProviderType(type.returnType),
        ...(type.typeParameters !== undefined ? { typeParameters: type.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
      };
    case "pointer":
      return {
        kind: "opaque",
        id: `csharp.pointer:${dotnetTypeRefKey(type.pointee)}`,
        displayName: "pointer",
      };
    case "function-pointer":
      return {
        kind: "opaque",
        id: `csharp.function-pointer:${type.args.map(dotnetTypeRefKey).join(",")}=>${dotnetTypeRefKey(type.result)}`,
        displayName: "function pointer",
      };
    case "opaque":
      return {
        kind: "opaque",
        id: type.id,
        ...(type.displayName !== undefined ? { displayName: type.displayName } : {}),
        ...(type.sourceShape !== undefined ? { sourceShape: dotnetTypeRefToProviderType(type.sourceShape) } : {}),
      };
  }
}

export function dotnetConstraintToTargetConstraint(constraint: DotnetConstraint): TargetConstraint {
  switch (constraint.kind) {
    case "implements": {
      const contract = dotnetTypeRefToTargetTypeRef(constraint.contract);
      return contract.kind === "target-named"
        ? {
            kind: "implements",
            contract: contract.id,
            ...(contract.typeArguments !== undefined ? { typeArguments: contract.typeArguments } : {}),
          }
        : { kind: "target-specific", target: "csharp", name: "implements", value: contract };
    }
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
      return { kind: constraint.kind };
    case "not-null":
      return { kind: "target-specific", target: "csharp", name: "not-null" };
    case "target-specific":
      return { kind: "target-specific", target: "csharp", name: constraint.name, value: constraint.value };
  }
}

export function dotnetTypeRefToTargetTypeRef(type: DotnetTypeRef): TargetTypeRef {
  switch (type.kind) {
    case "void":
      return { kind: "opaque", id: "System.Void" };
    case "any":
    case "unknown":
    case "object":
      return { kind: "target-named", id: "System.Object" };
    case "string":
      return { kind: "target-named", id: "System.String" };
    case "boolean":
      return { kind: "target-named", id: "System.Boolean" };
    case "number":
      return { kind: "target-named", id: "System.Double" };
    case "bigint":
      return { kind: "target-named", id: "System.Numerics.BigInteger" };
    case "source-primitive":
      return { kind: "source-primitive", name: type.name };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "named":
      return {
        kind: "target-named",
        id: type.metadataName,
        ...(type.typeArguments !== undefined ? { typeArguments: type.typeArguments.map(dotnetTypeRefToTargetTypeRef) } : {}),
      };
    case "array":
      return {
        kind: "array",
        element: dotnetTypeRefToTargetTypeRef(type.elementType),
        ...(type.rank !== undefined ? { rank: type.rank } : {}),
      };
    case "tuple":
      return { kind: "tuple", elements: type.elements.map(dotnetTypeRefToTargetTypeRef) };
    case "union":
      return { kind: "opaque", id: `csharp.union:${type.types.map(dotnetTypeRefKey).join("|")}` };
    case "function":
      return {
        kind: "target-named",
        id: type.returnType.kind === "void"
          ? `System.Action\`${type.parameters.length}`
          : `System.Func\`${type.parameters.length + 1}`,
        typeArguments: [
          ...type.parameters.map((parameter) => dotnetTypeRefToTargetTypeRef(parameter.type)),
          ...(type.returnType.kind === "void" ? [] : [dotnetTypeRefToTargetTypeRef(type.returnType)]),
        ],
      };
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

export function dotnetTypeParameterToProviderTypeParameter(typeParameter: DotnetTypeParameterDeclaration) {
  return {
    name: typeParameter.name,
    ...(typeParameter.constraints !== undefined
      ? { constraints: typeParameter.constraints.map(dotnetConstraintToProviderConstraint) }
      : {}),
    ...(typeParameter.variance !== undefined ? { variance: typeParameter.variance } : {}),
  };
}

function dotnetConstraintToProviderConstraint(constraint: DotnetConstraint): ProviderTypeExpression {
  switch (constraint.kind) {
    case "implements":
      return dotnetTypeRefToProviderType(constraint.contract);
    default:
      return { kind: "opaque", id: `csharp.constraint:${constraint.kind}` };
  }
}

function dotnetTypeRefKey(type: DotnetTypeRef): string {
  switch (type.kind) {
    case "named":
      return `${type.metadataName}<${(type.typeArguments ?? []).map(dotnetTypeRefKey).join(",")}>`;
    case "array":
      return `${dotnetTypeRefKey(type.elementType)}[]`;
    case "tuple":
      return `[${type.elements.map(dotnetTypeRefKey).join(",")}]`;
    case "union":
      return type.types.map(dotnetTypeRefKey).join("|");
    case "function":
      return `fn(${type.parameters.map((parameter) => dotnetTypeRefKey(parameter.type)).join(",")})=>${dotnetTypeRefKey(type.returnType)}`;
    case "pointer":
      return `ptr(${dotnetTypeRefKey(type.pointee)})`;
    case "function-pointer":
      return `fnptr(${type.args.map(dotnetTypeRefKey).join(",")})=>${dotnetTypeRefKey(type.result)}`;
    case "opaque":
      return type.id;
    case "source-primitive":
    case "type-parameter":
      return type.name;
    default:
      return type.kind;
  }
}
