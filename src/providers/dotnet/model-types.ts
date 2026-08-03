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

export interface DotnetRenderShape {
  readonly kind: "named";
  readonly namespace?: readonly string[];
  readonly name: string;
  readonly genericArity?: number;
  readonly nested?: readonly DotnetNestedRenderShape[];
}

export interface DotnetNestedRenderShape {
  readonly name: string;
  readonly genericArity?: number;
}

export interface DotnetAssemblyReference {
  readonly name: string;
  readonly version?: string;
  readonly publicKeyToken?: string;
  readonly culture?: string;
  readonly path?: string;
}

export interface DotnetSourceTypeFamilyDeclaration {
  readonly exportName: string;
  readonly typeArgumentCount: number;
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
  | DotnetUnsupportedTypeExportDeclaration;

export interface DotnetUnsupportedTypeFamilyExportDeclaration {
  readonly kind: "unsupported-type-family";
  readonly sourceName: string;
  readonly reason: string;
  readonly targetIds: readonly string[];
  readonly metadataNames: readonly string[];
  readonly assemblies?: readonly DotnetAssemblyReference[];
}

export interface DotnetUnsupportedTypeExportDeclaration {
  readonly kind: "unsupported-type-export";
  readonly sourceName: string;
  readonly targetId: string;
  readonly metadataName: string;
  readonly assembly?: DotnetAssemblyReference;
  readonly reason: string;
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
  readonly sourceTypeFamily?: DotnetSourceTypeFamilyDeclaration;
  readonly namespaceName: string;
  readonly targetId: string;
  readonly metadataName: string;
  readonly assembly?: DotnetAssemblyReference;
  readonly displayName?: string;
  readonly renderShape?: DotnetRenderShape;
  readonly attributes?: readonly DotnetAttributeDeclaration[];
  readonly unsupportedAttributes?: readonly DotnetUnsupportedAttributeDeclaration[];
  readonly typeParameters?: readonly DotnetTypeParameterDeclaration[];
  readonly baseType?: DotnetTypeRef;
  readonly implementedContracts?: readonly DotnetConstraint[];
  readonly unsupportedImplementedContracts?: readonly DotnetUnsupportedConstraintDeclaration[];
  readonly members?: readonly DotnetMemberDeclaration[];
  readonly conversionOperators?: readonly DotnetConversionOperatorDeclaration[];
  readonly unsupportedMembers?: readonly DotnetUnsupportedMemberDeclaration[];
  readonly sourceShape?: DotnetTypeRef;
  readonly targetType?: DotnetTypeRef;
  readonly throwable?: boolean;
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
  readonly targetId: string;
  readonly metadataName: string;
  readonly signatures: readonly DotnetSignatureDeclaration[];
}

export interface DotnetValueDeclaration {
  readonly kind: "value";
  readonly sourceName: string;
  readonly targetId: string;
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
  readonly targetId: string;
  readonly metadataName: string;
  readonly static?: boolean;
  readonly sourceStatic?: boolean;
  readonly sourceProjection?: "extension-method";
  readonly receiverPassing?: "instance" | "first-argument";
  readonly sourceParameterOffset?: number;
  readonly targetDeclaringType?: DotnetTypeRef;
  readonly readable?: boolean;
  readonly writable?: boolean;
  readonly type?: DotnetTypeRef;
  readonly signatures?: readonly DotnetSignatureDeclaration[];
  readonly attributes?: readonly DotnetAttributeDeclaration[];
  readonly unsupportedAttributes?: readonly DotnetUnsupportedAttributeDeclaration[];
}

export interface DotnetUnsupportedMemberDeclaration {
  readonly kind: "unsupported-member";
  readonly memberKind: DotnetMemberKind;
  readonly sourceName: string;
  readonly targetName: string;
  readonly targetId: string;
  readonly metadataName: string;
  readonly static?: boolean;
  readonly reason: string;
}

export interface DotnetSignatureDeclaration {
  readonly id: string;
  readonly sourceId: string;
  readonly targetName?: string;
  readonly attributes?: readonly DotnetAttributeDeclaration[];
  readonly unsupportedAttributes?: readonly DotnetUnsupportedAttributeDeclaration[];
  readonly typeParameters?: readonly DotnetTypeParameterDeclaration[];
  readonly parameters: readonly DotnetParameterDeclaration[];
  readonly returnType?: DotnetTypeRef;
  readonly targetReturnType?: DotnetTypeRef;
  readonly returnAttributes?: readonly DotnetAttributeDeclaration[];
  readonly unsupportedReturnAttributes?: readonly DotnetUnsupportedAttributeDeclaration[];
  readonly targetInvocation?: DotnetTargetInvocation;
}

export type DotnetTargetInvocation =
  | {
      readonly kind: "array-creation";
      readonly lengthParameterIndex: number;
    }
  | {
      readonly kind: "static-factory-construction";
      readonly factoryType: DotnetTypeRef;
    };

export interface DotnetConversionOperatorDeclaration {
  readonly id: string;
  readonly targetName: "op_Implicit" | "op_Explicit";
  readonly metadataName: string;
  readonly conversionKind: "implicit" | "explicit";
  readonly sourceType: DotnetTypeRef;
  readonly targetType: DotnetTypeRef;
}

export interface DotnetParameterDeclaration {
  readonly name: string;
  readonly type: DotnetTypeRef;
  readonly sourceType?: DotnetTypeRef;
  readonly passingMode: ArgumentPassingMode;
  readonly optional?: boolean;
  readonly rest?: boolean;
  readonly defaultValue?: DotnetParameterDefaultValue;
  readonly unsupportedDefaultValue?: DotnetUnsupportedDefaultValueDeclaration;
  readonly attributes?: readonly DotnetAttributeDeclaration[];
  readonly unsupportedAttributes?: readonly DotnetUnsupportedAttributeDeclaration[];
}

export type DotnetAttributePlacement =
  | "type"
  | "constructor"
  | "method"
  | "property"
  | "field"
  | "event"
  | "parameter"
  | "return";

export type DotnetAttributeValue =
  | { readonly kind: "null" }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "source-primitive"; readonly name: SourcePrimitiveKind; readonly value: string | boolean }
  | { readonly kind: "type"; readonly type: DotnetTypeRef }
  | { readonly kind: "enum"; readonly type: DotnetTypeRef; readonly value: string; readonly fieldName?: string }
  | { readonly kind: "array"; readonly elements: readonly DotnetAttributeValue[] };

export type DotnetAttributeArgument =
  | { readonly kind: "constructor"; readonly value: DotnetAttributeValue }
  | { readonly kind: "named"; readonly name: string; readonly memberKind: "field" | "property"; readonly value: DotnetAttributeValue };

export interface DotnetAttributeDeclaration {
  readonly id: string;
  readonly target: DotnetAttributePlacement;
  readonly attributeType: DotnetTypeRef;
  readonly constructorId: string;
  readonly arguments?: readonly DotnetAttributeArgument[];
  readonly evidence?: readonly { readonly message: string }[];
}

export interface DotnetUnsupportedAttributeDeclaration {
  readonly id: string;
  readonly target: DotnetAttributePlacement;
  readonly attributeType?: DotnetTypeRef | null;
  readonly constructorId?: string;
  readonly reason: string;
  readonly evidence?: readonly { readonly message: string }[];
}

export type DotnetParameterDefaultValue =
  | { readonly kind: "null" }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "source-primitive"; readonly name: SourcePrimitiveKind; readonly value: string | boolean }
  | { readonly kind: "enum"; readonly value: string; readonly fieldName?: string };

export interface DotnetUnsupportedDefaultValueDeclaration {
  readonly kind: "unsupported-default-value";
  readonly id: string;
  readonly parameterName: string;
  readonly reason: string;
  readonly evidence?: readonly { readonly message: string }[];
}

export interface DotnetTypeParameterDeclaration {
  readonly name: string;
  readonly constraints?: readonly DotnetConstraint[];
  readonly defaultType?: DotnetTypeRef;
  readonly unsupportedConstraints?: readonly DotnetUnsupportedConstraintDeclaration[];
  readonly variance?: "in" | "out" | "invariant" | "target-defined";
}

export interface DotnetUnsupportedConstraintDeclaration {
  readonly targetId: string;
  readonly metadataName: string;
  readonly reason: string;
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
  | { readonly kind: "undefined" }
  | { readonly kind: "object" }
  | { readonly kind: "string" }
  | { readonly kind: "literal"; readonly value: string | number | boolean | null }
  | { readonly kind: "boolean" }
  | { readonly kind: "number" }
  | { readonly kind: "bigint" }
  | { readonly kind: "source-primitive"; readonly name: SourcePrimitiveKind }
  | { readonly kind: "type-parameter"; readonly name: string }
  | { readonly kind: "provider-ref"; readonly moduleSpecifier: string; readonly exportName: string; readonly typeArguments?: readonly DotnetTypeRef[] }
  | { readonly kind: "named"; readonly targetId: string; readonly metadataName: string; readonly displayName?: string; readonly renderShape?: DotnetRenderShape; readonly typeArguments?: readonly DotnetTypeRef[]; readonly sourceShape?: DotnetTypeRef; readonly implicitArrayInput?: true }
  | { readonly kind: "nullable"; readonly elementType: DotnetTypeRef }
  | { readonly kind: "nullable-reference"; readonly elementType: DotnetTypeRef }
  | { readonly kind: "array"; readonly elementType: DotnetTypeRef; readonly rank?: number }
  | { readonly kind: "tuple"; readonly elements: readonly DotnetTypeRef[] }
  | { readonly kind: "union"; readonly types: readonly DotnetTypeRef[] }
  | { readonly kind: "function"; readonly id: string; readonly parameters: readonly DotnetParameterDeclaration[]; readonly returnType: DotnetTypeRef; readonly typeParameters?: readonly DotnetTypeParameterDeclaration[] }
  | { readonly kind: "pointer"; readonly pointee: DotnetTypeRef; readonly mutability?: "const" | "mut" | "target-defined" }
  | { readonly kind: "function-pointer"; readonly args: readonly DotnetTypeRef[]; readonly result: DotnetTypeRef; readonly abi?: readonly string[] }
  | { readonly kind: "opaque"; readonly id: string; readonly displayName?: string; readonly sourceShape?: DotnetTypeRef };
