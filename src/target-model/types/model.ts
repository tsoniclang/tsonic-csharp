import type {
  ArgumentPassingMode,
  ExtensionFactSubject,
  Node,
  ResolvedSourceWellKnownSymbolInfo,
  SourcePrimitiveKind,
  Type,
} from "@tsonic/tsts";

export type CsharpTypeofRuntimeKind = "string" | "number" | "boolean" | "bigint";

export type CsharpSourceMemberKey =
  | { readonly kind: "property"; readonly name: string }
  | {
      readonly kind: "well-known-symbol";
      readonly symbol: ResolvedSourceWellKnownSymbolInfo["kind"];
    };

export interface CsharpObjectShapeMemberFact {
  readonly sourceKey: CsharpSourceMemberKey;
  readonly sourceName: string;
  readonly sourceSubjects?: readonly ExtensionFactSubject[];
  readonly sourceDeclarations?: readonly Node[];
  readonly sourceTypes?: readonly Type[];
  readonly targetName: string;
  readonly memberKind: "property" | "method";
  readonly type: TargetTypeRef;
  readonly optional?: boolean;
  readonly readonly?: boolean;
  readonly accessor?: {
    readonly getter: true;
    readonly setter: boolean;
  };
}

export interface CsharpObjectShapeFact {
  readonly targetType: TargetTypeRef;
  readonly members: readonly CsharpObjectShapeMemberFact[];
  readonly implements?: readonly TargetTypeRef[];
  readonly constructible?: boolean;
}

export interface CsharpSourceTargetTypeBinding {
  readonly declaration: Node;
  readonly targetType: TargetTypeRef;
}

export type TargetTypeRef =
  | { readonly kind: "source-primitive"; readonly name: SourcePrimitiveKind }
  | { readonly kind: "source-global"; readonly name: string; readonly typeArguments?: readonly TargetTypeRef[] }
  | { readonly kind: "target-named"; readonly id: string; readonly typeArguments?: readonly TargetTypeRef[] }
  | { readonly kind: "type-parameter"; readonly name: string }
  | { readonly kind: "array"; readonly element: TargetTypeRef; readonly rank?: number }
  | { readonly kind: "tuple"; readonly elements: readonly TargetTypeRef[] }
  | { readonly kind: "pointer"; readonly pointee: TargetTypeRef; readonly mutability?: "const" | "mut" | "target-defined" }
  | { readonly kind: "function-pointer"; readonly args: readonly TargetTypeRef[]; readonly result: TargetTypeRef; readonly abi?: readonly string[] }
  | { readonly kind: "opaque"; readonly id: string }
  | { readonly kind: "associated-type"; readonly owner: TargetTypeRef; readonly name: string }
  | { readonly kind: "lifetime"; readonly name: string }
  | { readonly kind: "target-specific"; readonly target: string; readonly name: string; readonly payloadId?: string };

export type TargetConstraint =
  | { readonly kind: "implements"; readonly contract: string; readonly typeArguments?: readonly TargetTypeRef[] }
  | { readonly kind: "value-type" }
  | { readonly kind: "reference-type" }
  | { readonly kind: "constructible" }
  | { readonly kind: "unmanaged" }
  | { readonly kind: "copy" }
  | { readonly kind: "clone" }
  | { readonly kind: "default" }
  | { readonly kind: "sized" }
  | { readonly kind: "lifetime"; readonly name: string }
  | { readonly kind: "target-specific"; readonly target: string; readonly name: string; readonly payloadId?: string };

export interface TargetTypeParameter {
  readonly name: string;
  readonly constraints?: readonly TargetConstraint[];
  readonly variance?: "in" | "out" | "invariant" | "target-defined";
}

export interface TargetParameter {
  readonly name: string;
  readonly type: TargetTypeRef;
  readonly passingMode: ArgumentPassingMode;
  readonly optional?: boolean;
  readonly paramsArray?: boolean;
}

export interface TargetMember {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly kind: "method" | "constructor" | "property" | "field" | "indexer" | "event" | "operator";
  readonly static?: boolean;
  readonly parameters: readonly TargetParameter[];
  readonly returnType?: TargetTypeRef;
  readonly typeParameters?: readonly TargetTypeParameter[];
}

export interface TargetBindingFact {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly target: "csharp";
  readonly kind: "class" | "struct" | "interface" | "trait" | "enum" | "delegate" | "function" | "opaque";
  readonly typeParameters?: readonly TargetTypeParameter[];
  readonly members?: readonly TargetMember[];
  readonly implementedContracts?: readonly TargetConstraint[];
}

export type CsharpTargetTypeRenderShape =
  | { readonly kind: "predefined"; readonly name: string }
  | {
      readonly kind: "named";
      readonly externAlias?: string;
      readonly namespace?: readonly string[];
      readonly name: string;
      readonly genericArity?: number;
      readonly nested?: readonly CsharpTargetNestedTypeRenderShape[];
    }
  | { readonly kind: "nullable" };

export interface CsharpTargetNestedTypeRenderShape {
  readonly name: string;
  readonly genericArity?: number;
}

export interface CsharpStaticTargetMethod {
  readonly declaringType: TargetTypeRef;
  readonly memberName: string;
}

export interface CsharpStringIterationPolicy {
  readonly lengthMemberName: string;
  readonly substringMemberName: string;
  readonly highSurrogateMethod: CsharpStaticTargetMethod;
  readonly lowSurrogateMethod: CsharpStaticTargetMethod;
}

export type CsharpPropertyKeyIterationPolicy =
  | {
      readonly kind: "index";
      readonly lengthMemberName: string;
      readonly keyConversion: "invariant-string";
    }
  | {
      readonly kind: "key-collection";
      readonly memberName: string;
    };

export type CsharpTargetTypeRef =
  | (Exclude<TargetTypeRef, { readonly kind: "target-named" }> & {
      readonly csharpNullableReference?: true;
    })
  | CsharpTargetNamedTypeRef;

export type CsharpTargetNamedTypeRef = Extract<TargetTypeRef, { readonly kind: "target-named" }> & {
  readonly csharpNullableReference?: true;
  readonly csharpRender?: CsharpTargetTypeRenderShape;
  readonly csharpThrowable?: true;
  readonly csharpTypeofRuntimeKind?: CsharpTypeofRuntimeKind;
  readonly csharpSpecialType?: "string" | "void" | "nullable";
  readonly csharpSourceDeclarationKind?: "class" | "interface" | "enum" | "struct";
  readonly csharpBaseType?: TargetTypeRef;
  readonly csharpValueType?: true;
  readonly csharpAbsorbsNullish?: true;
  readonly csharpJsValueCarrier?: true;
  readonly csharpJsObjectShape?: true;
  readonly csharpArrayLiteralElementType?: TargetTypeRef;
  readonly csharpArrayLiteralConstructionType?: TargetTypeRef;
  readonly csharpImplicitArrayInputElementType?: TargetTypeRef;
  readonly csharpEnumerableElementType?: TargetTypeRef;
  readonly csharpReadOnlyIndexableElementType?: TargetTypeRef;
  readonly csharpDenseMutableElementType?: TargetTypeRef;
  readonly csharpIndexableLengthMemberName?: string;
  readonly csharpCollectionSemantics?: "dense" | "js-sparse";
  readonly csharpJsArrayMutation?: {
    readonly deleteAtMemberName: string;
    readonly setLengthMemberName: string;
  };
  readonly csharpStringIteration?: CsharpStringIterationPolicy;
  readonly csharpPropertyKeyIteration?: CsharpPropertyKeyIterationPolicy;
  readonly csharpDelegateSignature?: CsharpDelegateSignatureShape;
  readonly csharpTaskResultType?: TargetTypeRef;
  readonly csharpGeneratorProtocol?: CsharpGeneratorProtocol;
  readonly csharpIteratorResultProtocol?: CsharpIteratorResultProtocol;
  readonly csharpFlowRefinementRepresentation?: "identity";
  readonly csharpRuntimeUnionArms?: readonly TargetTypeRef[];
  readonly csharpRuntimeUnionObjectShapes?: readonly (CsharpObjectShapeFact | undefined)[];
  readonly csharpJsSurfaceKind?: "map" | "set" | "date" | "regexp";
  readonly csharpCollectionSurface?: "record";
};

export interface CsharpGeneratorProtocol {
  readonly kind: "sync" | "async";
  readonly yieldType: TargetTypeRef;
  readonly returnType: TargetTypeRef;
  readonly nextType: TargetTypeRef;
}

export interface CsharpIteratorResultProtocol {
  readonly yieldType: TargetTypeRef;
  readonly returnType: TargetTypeRef;
}

export type CsharpNullableReferenceTargetTypeRef = TargetTypeRef & {
  readonly csharpNullableReference?: true;
};

export type CsharpTargetAttributeValue =
  | { readonly kind: "null" }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "source-primitive"; readonly name: string; readonly value: string | boolean }
  | { readonly kind: "type"; readonly type: TargetTypeRef }
  | { readonly kind: "enum"; readonly type: TargetTypeRef; readonly value: string; readonly fieldName?: string }
  | { readonly kind: "array"; readonly elements: readonly CsharpTargetAttributeValue[] };

export type CsharpTargetAttributeArgument =
  | { readonly kind: "constructor"; readonly value: CsharpTargetAttributeValue }
  | { readonly kind: "named"; readonly name: string; readonly memberKind: "field" | "property"; readonly value: CsharpTargetAttributeValue };

export interface CsharpTargetAttributeFact {
  readonly id: string;
  readonly target: "type" | "constructor" | "method" | "property" | "field" | "event" | "parameter" | "return";
  readonly attributeType: TargetTypeRef;
  readonly constructorId: string;
  readonly arguments?: readonly CsharpTargetAttributeArgument[];
  readonly evidence?: readonly { readonly message: string }[];
}

export interface CsharpTargetUnsupportedAttributeFact {
  readonly id: string;
  readonly target: CsharpTargetAttributeFact["target"];
  readonly attributeType?: TargetTypeRef;
  readonly constructorId?: string;
  readonly reason: string;
  readonly evidence?: readonly { readonly message: string }[];
}

export interface CsharpTargetUnsupportedDefaultValueFact {
  readonly kind: "unsupported-default-value";
  readonly id: string;
  readonly parameterName: string;
  readonly reason: string;
  readonly evidence?: readonly { readonly message: string }[];
}

export interface CsharpTargetParameter extends TargetParameter {
  readonly defaultValue?: unknown;
  readonly unsupportedDefaultValue?: CsharpTargetUnsupportedDefaultValueFact;
  readonly attributes?: readonly CsharpTargetAttributeFact[];
  readonly unsupportedAttributes?: readonly CsharpTargetUnsupportedAttributeFact[];
  readonly csharpOutputMayBeNull?: true;
  readonly csharpAcceptsCheckedSourceArgument?: true;
  readonly csharpAcceptsClosedSourceArgument?: true;
  readonly csharpOmittableOptionalArgument?: true;
  readonly csharpSourceArgumentAdapter?: CsharpSourceArgumentAdapter;
}

export interface CsharpSourceArgumentAdapter {
  readonly kind: "ecmascript-argument-vector-callback";
  readonly sourceCallableType: TargetTypeRef;
}

export type CsharpObjectShapeCapability =
  | "json-serialization";

export type CsharpObjectShapeProjectionKind =
  | "keys"
  | "values"
  | "entries"
  | "has-own";

export interface CsharpObjectShapeProjection {
  readonly kind: CsharpObjectShapeProjectionKind;
  readonly resultType: TargetTypeRef;
  readonly propertyOrder: readonly string[];
}

interface CsharpCallArtifactRequirementBase {
  readonly source:
    | { readonly kind: "receiver" }
    | { readonly kind: "argument"; readonly index: number };
  readonly rootKind: "value" | "object-shape";
}

export type CsharpCallArtifactRequirement =
  | CsharpCallArtifactRequirementBase & {
      readonly kind: "object-shape-capability";
      readonly capability: CsharpObjectShapeCapability;
    }
  | CsharpCallArtifactRequirementBase & {
      readonly kind: "object-shape-projection";
      readonly projection: CsharpObjectShapeProjectionKind;
    };

export interface CsharpMethodTypeArgumentProjection {
  readonly kind: "project-constructible-object-shape";
  readonly targetTypeParameterIndex: number;
}

export interface CsharpTargetTypeParameter extends TargetTypeParameter {
  readonly unsupportedConstraints?: readonly unknown[];
}

export interface CsharpTargetMember extends Omit<TargetMember, "parameters" | "typeParameters"> {
  readonly parameters: readonly CsharpTargetParameter[];
  readonly typeParameters?: readonly CsharpTargetTypeParameter[];
  readonly declaringType?: TargetTypeRef;
  readonly receiverPassing?: "instance" | "first-argument";
  readonly readonly?: boolean;
  readonly attributes?: readonly CsharpTargetAttributeFact[];
  readonly unsupportedAttributes?: readonly CsharpTargetUnsupportedAttributeFact[];
  readonly returnAttributes?: readonly CsharpTargetAttributeFact[];
  readonly unsupportedReturnAttributes?: readonly CsharpTargetUnsupportedAttributeFact[];
  readonly csharpArtifactRequirements?: readonly CsharpCallArtifactRequirement[];
  readonly csharpMethodTypeArgumentProjections?: readonly CsharpMethodTypeArgumentProjection[];
  readonly csharpInvocation?: CsharpTargetInvocation;
}

export type CsharpTargetInvocation =
  | {
      readonly kind: "static-factory-construction";
      readonly factoryType: TargetTypeRef;
    }
  | {
      readonly kind: "array-creation";
      readonly lengthParameterIndex: number;
    }
  | {
      readonly kind: "object-shape-projection";
      readonly targetParameterIndex: number;
      readonly projection: CsharpObjectShapeProjectionKind;
    }
  | {
      readonly kind: "ecmascript-protocol-dispatch";
      readonly protocolTargetParameterIndex: number;
      readonly protocolMemberName: string;
    };

export interface CsharpTargetConversionOperatorFact {
  readonly id: string;
  readonly conversionKind: "implicit" | "explicit";
  readonly declaringType: TargetTypeRef;
  readonly sourceType: TargetTypeRef;
  readonly targetType: TargetTypeRef;
}

export interface CsharpTargetBindingFact extends Omit<TargetBindingFact, "members" | "typeParameters"> {
  readonly csharpType?: TargetTypeRef;
  readonly csharpBaseType?: TargetTypeRef;
  readonly csharpRender?: CsharpTargetTypeRenderShape;
  readonly typeParameters?: readonly CsharpTargetTypeParameter[];
  readonly members?: readonly CsharpTargetMember[];
  readonly attributes?: readonly CsharpTargetAttributeFact[];
  readonly unsupportedAttributes?: readonly CsharpTargetUnsupportedAttributeFact[];
  readonly conversionOperators?: readonly CsharpTargetConversionOperatorFact[];
}

export function csharpTargetBindingFact(binding: TargetBindingFact | undefined): CsharpTargetBindingFact | undefined {
  return binding as CsharpTargetBindingFact | undefined;
}

export function csharpTargetMemberFact(member: TargetMember | undefined): CsharpTargetMember | undefined {
  return member as CsharpTargetMember | undefined;
}

export function csharpTargetMemberFacts(members: readonly TargetMember[] | undefined): readonly CsharpTargetMember[] {
  return (members ?? []) as readonly CsharpTargetMember[];
}

export interface CsharpDelegateSignatureShape {
  readonly parameters: readonly TargetTypeRef[];
  readonly returnType: TargetTypeRef;
  readonly optionalParameterIndexes?: readonly number[];
  readonly restParameterIndex?: number;
}

export type CsharpDelegateTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpDelegateSignature: CsharpDelegateSignatureShape;
};

export type CsharpTaskTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpTaskResultType: TargetTypeRef;
};

export type CsharpRuntimeUnionTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpRuntimeUnionArms: readonly TargetTypeRef[];
  readonly csharpRuntimeUnionObjectShapes?: readonly (CsharpObjectShapeFact | undefined)[];
};
