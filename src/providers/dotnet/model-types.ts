import type {
  ArgumentPassingMode,
  SourcePrimitiveKind,
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
  readonly targetOnlyTypes?: readonly DotnetTypeDeclaration[];
  readonly unsupportedExports?: readonly DotnetUnsupportedExportDeclaration[];
}

export type DotnetUnsupportedExportDeclaration =
  | DotnetUnsupportedTypeFamilyExportDeclaration
  | DotnetUnsupportedNestedTypeExportDeclaration;

export interface DotnetUnsupportedTypeFamilyExportDeclaration {
  readonly kind: "unsupported-type-family";
  readonly sourceName: string;
  readonly reason: string;
  readonly metadataNames: readonly string[];
}

export interface DotnetUnsupportedNestedTypeExportDeclaration {
  readonly kind: "unsupported-nested-type";
  readonly sourceName: string;
  readonly reason: string;
  readonly metadataName: string;
  readonly declaringMetadataName?: string;
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
  readonly baseType?: DotnetTypeRef;
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
  | { readonly kind: "provider-ref"; readonly name: string; readonly moduleSpecifier?: string; readonly typeArguments?: readonly DotnetTypeRef[] }
  | { readonly kind: "named"; readonly metadataName: string; readonly displayName?: string; readonly typeArguments?: readonly DotnetTypeRef[]; readonly sourceShape?: DotnetTypeRef }
  | { readonly kind: "array"; readonly elementType: DotnetTypeRef; readonly rank?: number }
  | { readonly kind: "tuple"; readonly elements: readonly DotnetTypeRef[] }
  | { readonly kind: "union"; readonly types: readonly DotnetTypeRef[] }
  | { readonly kind: "function"; readonly parameters: readonly DotnetParameterDeclaration[]; readonly returnType: DotnetTypeRef; readonly typeParameters?: readonly DotnetTypeParameterDeclaration[] }
  | { readonly kind: "pointer"; readonly pointee: DotnetTypeRef; readonly mutability?: "const" | "mut" | "target-defined" }
  | { readonly kind: "function-pointer"; readonly args: readonly DotnetTypeRef[]; readonly result: DotnetTypeRef; readonly abi?: readonly string[] }
  | { readonly kind: "opaque"; readonly id: string; readonly displayName?: string; readonly sourceShape?: DotnetTypeRef };
