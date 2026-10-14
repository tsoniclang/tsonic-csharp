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
}

export type CsharpFlowReadProjection =
  | { readonly kind: "identity" }
  | { readonly kind: "non-null" }
  | { readonly kind: "conversion"; readonly source: TargetTypeRef; readonly target: TargetTypeRef;
      readonly selection: CsharpConversionSelection }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpFlowReadClassifications {
  readonly flowReadProjection: { readonly get: (node: Node) => CsharpFlowReadProjection | undefined };
}

export interface CsharpSourceEvidenceIndex {
  readonly bindingProjection: { readonly get: (node: Node) => import("./binding-projection-policy.js").CsharpBindingProjection | undefined };
  readonly memoryMetadataIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly typeOnlyIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly fixedArrayIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly pointerBackingDemands: readonly import("@tsonic/source-core/facts").TsonicPointerBackingDemand[];
  readonly compileTimeMetadata: { readonly get: (node: Node) => boolean };
  readonly targetTypes: readonly TargetTypeRef[];
  readonly nodeTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly classConstructorType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly storageTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly readStorageTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly expressionType: { readonly get: (node: Node) => Type | undefined };
  readonly contextualType: { readonly get: (node: Node) => Type | undefined };
  readonly contextualTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly semanticTargetType: { readonly get: (type: Type, sourceFile: SourceFile) => TargetTypeRef | undefined };
  readonly semanticType: { readonly get: (type: Type, sourceFile: SourceFile) => CsharpSemanticTypeClassification | undefined };
  readonly signatureDeclaration: { readonly get: (signature: Signature) => Node | undefined };
  readonly contextualTuple: { readonly get: (node: Node) => CsharpContextualTupleClassification | undefined };
  readonly constantValue: { readonly get: (node: Node) => { readonly value: unknown } | undefined };
  readonly valueRefinement: { readonly get: (node: Node) => CsharpValueRefinementClassification | undefined };
  readonly generator: { readonly get: (node: Node) => ResolvedSourceGeneratorInfo | undefined };
  readonly generatorTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly yield: { readonly get: (node: Node) => ResolvedSourceYieldInfo | undefined };
  readonly yieldTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly wellKnownSymbol: { readonly get: (node: Node) => ResolvedSourceWellKnownSymbolInfo | undefined };
  readonly inferredCallableReturnType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly pointerReturn: { readonly get: (node: Node) => import("./pointer-return.js").CsharpPointerReturnContract | undefined };
  readonly sourceArgument: { readonly get: (node: Node) => CsharpSourceArgumentClassification | undefined };
  readonly sourceDefaultValue: { readonly get: (node: Node) => CsharpSourceDefaultValue | undefined };
  readonly sourceField: { readonly get: (subjects: readonly (Node | undefined)[]) => CsharpSourceField | undefined };
  readonly sourceStruct: { readonly get: (node: Node) => CsharpSourceStruct | undefined };
  readonly providerVirtualDeclaration: { readonly get: (node: Node) => boolean };
  readonly typeParameterConstraints: { readonly get: (node: Node) => CsharpTypeParameterConstraintResolution | undefined };
  readonly sourceOwnedProjectShape: { readonly get: (node: Node) => boolean | undefined };
}
