import type {
  Node,
  ResolvedSourceGeneratorInfo,
  ResolvedSourceWellKnownSymbolInfo,
  ResolvedSourceYieldInfo,
  Signature,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  SourceValueTypeRefinementSelection,
} from "@tsonic/target-api/source";
import type {
  TargetTypeRef,
} from "../../target-model/types/model.js";
import type {
  CsharpTypeParameterConstraintResolution,
} from "../../target-model/declarations/generic-constraints.js";
import type {
  CsharpConversionSelection,
} from "../../policy/conversions/index.js";
import type {
  CsharpSourceDefaultValue,
  CsharpSourceField,
  CsharpSourceStruct,
} from "../../policy/types/index.js";

export type CsharpSourceArgumentClassification =
  | {
      readonly kind: "resolved";
      readonly argument: {
        readonly passingMode: import("@tsonic/tsts").ArgumentPassingMode;
        readonly storageExpression: Node;
      };
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export interface CsharpSemanticTypeClassification {
  readonly targetType?: TargetTypeRef;
  readonly typeParameterName?: string;
  readonly nullish: boolean;
  readonly intrinsic:
    | "any"
    | "unknown"
    | "boolean"
    | "number"
    | "string"
    | "bigint"
    | "void"
    | "other";
}

export type CsharpContextualTupleClassification =
  | {
      readonly kind: "selected";
      readonly elementTypes: readonly (TargetTypeRef | undefined)[];
      readonly optionalElementIndexes: readonly number[];
      readonly omittedOptionalElementIndexes: readonly number[];
    }
  | { readonly kind: "unavailable" };

export interface CsharpValueRefinementClassification {
  readonly source: SourceValueTypeRefinementSelection;
  readonly selectedTargetType?: TargetTypeRef;
  readonly memberTargetTypes?: readonly (TargetTypeRef | undefined)[];
  readonly flowReadTargetType?: TargetTypeRef;
  readonly flowReadConversion?: CsharpConversionSelection;
}

export interface CsharpSourceEvidenceIndex {
  readonly memoryMetadataIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly pointerBackingDemands: readonly import("@tsonic/source-core/facts").TsonicPointerBackingDemand[];
  isCompileTimeMetadata(node: Node): boolean;
  readonly targetTypes: readonly TargetTypeRef[];
  nodeTargetType(node: Node): TargetTypeRef | undefined;
  storageTargetType(node: Node): TargetTypeRef | undefined;
  readStorageTargetType(node: Node): TargetTypeRef | undefined;
  expressionType(node: Node): Type | undefined;
  contextualType(node: Node): Type | undefined;
  contextualTargetType(node: Node): TargetTypeRef | undefined;
  targetType(type: Type, sourceFile: SourceFile): TargetTypeRef | undefined;
  semanticType(type: Type, sourceFile: SourceFile): CsharpSemanticTypeClassification | undefined;
  signatureDeclaration(signature: Signature): Node | undefined;
  contextualTuple(node: Node): CsharpContextualTupleClassification | undefined;
  constantValue(node: Node): { readonly value: unknown } | undefined;
  valueRefinement(node: Node): CsharpValueRefinementClassification | undefined;
  generator(node: Node): ResolvedSourceGeneratorInfo | undefined;
  generatorTargetType(node: Node): TargetTypeRef | undefined;
  yield(node: Node): ResolvedSourceYieldInfo | undefined;
  yieldTargetType(node: Node): TargetTypeRef | undefined;
  wellKnownSymbol(node: Node): ResolvedSourceWellKnownSymbolInfo | undefined;
  inferredCallableReturnType(node: Node): TargetTypeRef | undefined;
  argument(node: Node): CsharpSourceArgumentClassification | undefined;
  defaultValue(node: Node): CsharpSourceDefaultValue | undefined;
  sourceField(
    subjects: readonly (Node | undefined)[],
  ): CsharpSourceField | undefined;
  sourceStruct(node: Node): CsharpSourceStruct | undefined;
  providerVirtualDeclaration(node: Node): boolean;
  typeParameterConstraints(
    node: Node,
  ): CsharpTypeParameterConstraintResolution | undefined;
  sourceOwnedProjectShape(node: Node): boolean | undefined;
}
