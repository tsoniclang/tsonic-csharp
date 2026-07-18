import type {
  ExtensionEvidence,
  ExtensionFactSubject,
  TargetConstraint,
  TargetOperationFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../csharp-source-semantics/target-types.js";

export type CsharpTypeofRuntimeKind = "string" | "number" | "boolean" | "bigint";

export const CsharpTargetOperatorOperation = {
  typeTest: "type-test",
} as const;

export type CsharpTargetOperatorOperation = typeof CsharpTargetOperatorOperation[keyof typeof CsharpTargetOperatorOperation];

export const csharpSourceOwnedPropertyOperationPrefix = "tsonic.csharp.source.property:";

export function isCsharpSourceOwnedPropertyOperation(operation: TargetOperationFact | undefined): boolean {
  return operation?.operationKind === "property" &&
    operation.operationId.startsWith(csharpSourceOwnedPropertyOperationPrefix);
}

export interface CsharpObjectShapeMemberFact {
  readonly sourceName: string;
  readonly sourceSubjects?: readonly ExtensionFactSubject[];
  readonly targetName: string;
  readonly memberKind: "property" | "method";
  readonly type: TargetTypeRef;
  readonly optional?: boolean;
  readonly readonly?: boolean;
}

export interface CsharpObjectShapeFact {
  readonly targetType: TargetTypeRef;
  readonly members: readonly CsharpObjectShapeMemberFact[];
  readonly implements?: readonly TargetTypeRef[];
  readonly constructible?: boolean;
}

export interface CsharpJsonSerializableShapeFact {
  readonly kind: "closed-object-shape";
}

export interface CsharpTargetNameFact {
  readonly name: string;
}

export interface CsharpAttributeApplicationFact {
  readonly attributeType: ExtensionFactSubject;
  readonly attributeName: string;
  readonly arguments?: readonly ExtensionFactSubject[];
  readonly applicationTarget: ExtensionFactSubject;
  readonly applicationPlacement?: "declaration" | "constructor";
  readonly applicationParameterName?: string;
  readonly applicationTargetSpecifier?: string;
}

export type CsharpTypeParameterConstraint =
  | TargetConstraint
  | CsharpExplicitTypeParameterConstraint
  | CsharpKeywordTypeParameterConstraint
  | CsharpConstructorTypeParameterConstraint;

export interface CsharpExplicitTypeParameterConstraint {
  readonly kind: "csharp-type";
  readonly type: TargetTypeRef;
}

export interface CsharpKeywordTypeParameterConstraint {
  readonly kind: "csharp-keyword";
  readonly keyword: "class" | "struct" | "notnull" | "unmanaged";
}

export interface CsharpConstructorTypeParameterConstraint {
  readonly kind: "csharp-constructor";
}

export interface CsharpTargetTypeParameterConstraintFact {
  readonly constraints: readonly CsharpTypeParameterConstraint[];
}

export interface CsharpObservedTargetAssignabilityFact {
  readonly source: ExtensionFactSubject;
  readonly target: ExtensionFactSubject;
  readonly relation?: "assignment" | "constraint" | "return" | "argument";
  readonly errorNode?: ExtensionFactSubject;
  readonly expression?: ExtensionFactSubject;
}

export interface CsharpTargetIterationFact {
  readonly operationId: string;
  readonly iterationKind: "sync" | "async" | "property-key";
  readonly lowering: CsharpTargetIterationLowering;
  readonly elementType?: ExtensionFactSubject;
  readonly evidence?: readonly ExtensionEvidence[];
}

export type CsharpTargetIterationLowering =
  | { readonly kind: "foreach" }
  | {
      readonly kind: "string-code-point";
      readonly lengthMember: string;
      readonly substringMember: string;
      readonly highSurrogateOperation: CsharpTargetMemberOperationFact;
      readonly lowSurrogateOperation: CsharpTargetMemberOperationFact;
    }
  | {
      readonly kind: "index-key";
      readonly lengthMember: string;
      readonly keyConversion: "invariant-string";
    }
  | {
      readonly kind: "key-collection";
      readonly keysMember: CsharpTargetMemberOperationFact;
    }
  | { readonly kind: "object-shape-keys" };

export interface CsharpRegularExpressionLiteralFact {
  readonly pattern: string;
  readonly flags: string;
}

export type CsharpArrayCarrierLane =
  | "native-fixed-local"
  | "native-read-sequence"
  | "native-read-indexable"
  | "native-dense-mutable"
  | "native-array-required"
  | "js-full-internal"
  | "hard-reject";

export type CsharpArrayBoundaryKind =
  | "local"
  | "internal-call"
  | "exported-api"
  | "native-provider-call";

export type CsharpArrayPublicShape =
  | "IEnumerable<T>"
  | "IReadOnlyList<T>"
  | "List<T>"
  | "T[]"
  | "compat-facade"
  | "not-exportable-as-native";

export interface CsharpArrayCarrierFact {
  readonly sourceKind: "ts-array" | "readonly-ts-array" | "tuple" | "typed-array" | "native-array";
  readonly lane: CsharpArrayCarrierLane;
  readonly elementType: TargetTypeRef;
  readonly carrierType: TargetTypeRef;
  readonly mutationVisibility: "none" | "internal" | "caller-visible";
  readonly boundary: CsharpArrayBoundaryKind;
}

export interface CsharpArrayBoundaryFact {
  readonly publicShape: CsharpArrayPublicShape;
  readonly publicType: TargetTypeRef;
  readonly coreCarrierLane: CsharpArrayCarrierLane;
  readonly coreCarrierType: TargetTypeRef;
  readonly preservesMutationVisibility: boolean;
  readonly requiresCopyIn: boolean;
  readonly requiresCopyOut: boolean;
}

export interface CsharpSourceReturnCarrierFact {
  readonly carrier: TargetTypeRef;
}

export interface CsharpProjectSourceFact {
  readonly kind: "project-source";
}

export interface CsharpByrefStorageFact {
  readonly targetType: TargetTypeRef;
}

export interface CsharpSelectedCallTargetFact {
  readonly member: CsharpTargetMember;
  readonly finalizationRequirement?: CsharpTargetMember["csharpCallFinalization"];
  readonly selectionFamily?: {
    readonly familyId: string;
    readonly sourceIdentity: string;
    readonly members: readonly CsharpTargetMember[];
  };
}

export interface CsharpSelectedPropertyTargetFact {
  readonly selection:
    | {
        readonly kind: "deferred-target-operation";
        readonly operationId: string;
      }
    | {
        readonly kind: "structural-compat-property";
        readonly propertyName: string;
        readonly sourceSelectedDeclaration: ExtensionFactSubject;
        readonly sourceResultType?: ExtensionFactSubject;
      };
}

export type CsharpTargetOperationFact =
  | CsharpTargetMemberOperationFact
  | CsharpTargetArrayCreationOperationFact
  | CsharpTargetTokenOperatorOperationFact
  | CsharpTargetIntrinsicOperatorOperationFact
  | CsharpTargetTypeofRuntimeOperationFact
  | CsharpTargetTypeofComparisonOperationFact
  | CsharpTargetCastOperationFact
  | CsharpTargetConversionOperatorOperationFact;

export interface CsharpTargetMemberOperationFact {
  readonly kind: "member";
  readonly operationId: string;
  readonly operationKind: "property" | "method" | "indexer" | "constructor" | "operator";
  readonly memberName: string;
  readonly static?: boolean;
  readonly declaringType?: TargetTypeRef;
  readonly sourceDeclaringType?: ExtensionFactSubject;
  readonly resultType?: TargetTypeRef;
  readonly typeArguments?: readonly TargetTypeRef[];
  readonly argumentProjection?: readonly CsharpTargetOperationArgument[];
  readonly argumentArrayLiteralElementTypes?: readonly (TargetTypeRef | undefined)[];
  readonly invocationKind?: "static-factory-construction";
  readonly selectedMember?: CsharpTargetMember;
}

export interface CsharpTargetArrayCreationOperationFact {
  readonly kind: "array-creation";
  readonly operationId: string;
  readonly elementType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
  readonly lengthArgumentIndex: number;
  readonly selectedMember: CsharpTargetMember;
}

export type CsharpTargetOperationArgument =
  | { readonly kind: "source-argument"; readonly index: number }
  | { readonly kind: "literal"; readonly value: string | number | boolean | null };

export interface CsharpTargetIntrinsicOperatorOperationFact {
  readonly kind: "intrinsic-operator";
  readonly operationId: string;
  readonly operator: CsharpTargetOperatorOperation;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetTokenOperatorOperationFact {
  readonly kind: "operator-token";
  readonly operationId: string;
  readonly operator: string;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetTypeofRuntimeOperationFact {
  readonly kind: "typeof-runtime";
  readonly operationId: string;
  readonly runtimeKind: CsharpTypeofRuntimeKind;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetTypeofComparisonOperationFact {
  readonly kind: "typeof-comparison";
  readonly operationId: string;
  readonly runtimeKind: CsharpTypeofRuntimeKind;
  readonly targetType: TargetTypeRef;
  readonly negated: boolean;
  readonly compatRuntimeOperation: CsharpTargetMemberOperationFact;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetCastOperationFact {
  readonly kind: "cast";
  readonly operationId: string;
  readonly targetType: TargetTypeRef;
  readonly resultType?: TargetTypeRef;
}

export interface CsharpTargetConversionOperatorOperationFact {
  readonly kind: "conversion-operator";
  readonly operationId: string;
  readonly conversionKind: "implicit" | "explicit";
  readonly declaringType: TargetTypeRef;
  readonly sourceType: TargetTypeRef;
  readonly targetType: TargetTypeRef;
  readonly resultType?: TargetTypeRef;
}
