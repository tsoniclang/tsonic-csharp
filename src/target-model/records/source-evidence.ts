import type { CsharpConversionSelection } from "../conversions/selection.js";
import type { CsharpTypeParameterConstraintResolution } from "../types/generic-constraints.js";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpSourceDefaultValue, CsharpSourceField, CsharpSourceStruct } from "./source-markers.js";
import type { SourceValueTypeRefinementSelection } from "@tsonic/target-api/source";
import type { Node, ResolvedSourceGeneratorInfo, ResolvedSourceWellKnownSymbolInfo, ResolvedSourceYieldInfo, Signature, SourceFile, Type } from "@tsonic/tsts";

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
  readonly typeParameter?: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
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
  readonly bindingProjection: { get(node: Node): import("./binding-projection-policy.js").CsharpBindingProjection | undefined };
  readonly closedArrayStorage: { get(node: Node): import("@tsonic/source-core/facts").TsonicClosedArrayStorage };
  readonly memoryMetadataIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly typeOnlyIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly fixedArrayIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly pointerBackingDemands: readonly import("@tsonic/source-core/facts").TsonicPointerBackingDemand[];
  readonly compileTimeMetadata: { get(node: Node): boolean };
  readonly targetTypes: readonly TargetTypeRef[];
  readonly nodeTargetType: { get(node: Node): TargetTypeRef | undefined };
  readonly classConstructorType: { get(node: Node): TargetTypeRef | undefined };
  readonly storageTargetType: { get(node: Node): TargetTypeRef | undefined };
  readonly readStorageTargetType: { get(node: Node): TargetTypeRef | undefined };
  readonly expressionType: { get(node: Node): Type | undefined };
  readonly contextualType: { get(node: Node): Type | undefined };
  readonly contextualTargetType: { get(node: Node): TargetTypeRef | undefined };
  readonly semanticTargetType: { get(type: Type, sourceFile: SourceFile): TargetTypeRef | undefined };
  readonly semanticType: { get(type: Type, sourceFile: SourceFile): CsharpSemanticTypeClassification | undefined };
  readonly signatureDeclaration: { get(signature: Signature): Node | undefined };
  readonly contextualTuple: { get(node: Node): CsharpContextualTupleClassification | undefined };
  readonly constantValue: { get(node: Node): { readonly value: unknown } | undefined };
  readonly valueRefinement: { get(node: Node): CsharpValueRefinementClassification | undefined };
  readonly generator: { get(node: Node): ResolvedSourceGeneratorInfo | undefined };
  readonly generatorTargetType: { get(node: Node): TargetTypeRef | undefined };
  readonly yield: { get(node: Node): ResolvedSourceYieldInfo | undefined };
  readonly yieldTargetType: { get(node: Node): TargetTypeRef | undefined };
  readonly wellKnownSymbol: { get(node: Node): ResolvedSourceWellKnownSymbolInfo | undefined };
  readonly inferredCallableReturnType: { get(node: Node): TargetTypeRef | undefined };
  readonly pointerReturn: { get(node: Node): import("./pointer-return.js").CsharpPointerReturnContract | undefined };
  readonly sourceArgument: { get(node: Node): CsharpSourceArgumentClassification | undefined };
  readonly sourceDefaultValue: { get(node: Node): CsharpSourceDefaultValue | undefined };
  readonly sourceField: { get(subjects: readonly (Node | undefined)[]): CsharpSourceField | undefined };
  readonly sourceStruct: { get(node: Node): CsharpSourceStruct | undefined };
  readonly providerVirtualDeclaration: { get(node: Node): boolean };
  readonly typeParameterConstraints: { get(node: Node): CsharpTypeParameterConstraintResolution | undefined };
  readonly sourceOwnedProjectShape: { get(node: Node): boolean | undefined };
}
