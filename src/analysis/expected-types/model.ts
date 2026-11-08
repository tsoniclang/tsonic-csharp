import type { CsharpObjectShapeFact } from "../../target-model/types/model.js";
import type { CsharpExpectedTypeIssue, CsharpQuotationBindingSelection } from "../../target-model/records/types/expected-types.js";
import type { CsharpExactLiteralRequest, CsharpNativePropertyKeyBinding } from "../../target-model/conversions/exact-literals.js";
import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpConversionMode } from "../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/operations/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/program/declarations.js";
import type { CsharpExpectedNativeUse, CsharpExpectedNativeUseInput, CsharpNativeCallableCreation, CsharpNativeUseSlot } from "../../target-model/records/native/native-demand.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpNativeRepresentationPending } from "../../target-model/records/native/native-representation.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/types/expected-types.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpCallableContractIndex, CsharpCallableCreationIndex } from "../../target-model/records/callables/callable-values.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";

export type CsharpExpectedTypeStrength = "contextual" | "required";

export interface CsharpExpectedTypeAnalysisInput {
  readonly policy: CsharpPolicyContext;
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications;
  readonly callables: CsharpCallableContractIndex;
  readonly valueReadStages: CsharpValueReadStageIndex;
  readonly declarations: Pick<CsharpDeclarationClassifications, "returnContract" | "runtimeDefault">;
  readonly typeProjections: CsharpGenericProjectionIndex;
}

export interface CsharpExpectedTypeAnalysis extends CsharpExpectedTypeClassifications {
  readonly completeReturns: (creations: CsharpCallableCreationIndex["callableCreation"]) => void;
  readonly nativeUseSites: CsharpExpectedNativeUseSites;
  readonly constructions: ReturnType<CsharpExpectedTypePropagation["seal"]>;
}

export interface CsharpExpectedTypeUse {
  readonly targetType: TargetTypeRef;
  readonly strength: CsharpExpectedTypeStrength;
  readonly exactInteger: boolean;
}

export interface CsharpExpectedTypePending extends CsharpExpectedTypeUse {
  readonly expression: Node;
  readonly site?: TargetUseSiteRef;
  readonly mode?: CsharpConversionMode;
}

export type CsharpExpectedUseWithholding =
  | "operation" | "argument-refused" | "argument-unresolved" | "argument-inconsistent" | "argument-sequence"
  | "expression-unresolved" | "target-unresolved";

export interface CsharpExpectedUseSiteDemand {
  readonly owner: Node;
  readonly slot: CsharpNativeUseSlot;
  readonly mode?: CsharpConversionMode;
  readonly forwardedFrom?: TargetUseSiteRef;
  readonly withheld?: CsharpExpectedUseWithholding;
}

interface ExpectedUseRequestBase {
  readonly site: TargetUseSiteRef;
  readonly strength: CsharpExpectedTypeStrength;
  readonly exactInteger: boolean;
  readonly mode: CsharpConversionMode;
  readonly forwardedFrom?: TargetUseSiteRef;
}

export type CsharpExpectedUseRequest =
  | ExpectedUseRequestBase & { readonly kind: "requested"; readonly expression: Node; readonly targetType: TargetTypeRef }
  | ExpectedUseRequestBase & { readonly kind: "pending"; readonly expression?: Node; readonly targetType?: TargetTypeRef;
      readonly reason: CsharpExpectedUseWithholding };

export type CsharpExpectedTypeRecord = (
  expression: Node | undefined,
  targetType: TargetTypeRef | undefined,
  strength: CsharpExpectedTypeStrength,
  demand?: CsharpExpectedUseSiteDemand,
  exactInteger?: boolean,
) => void;

export interface CsharpExpectedNativeUseFinalInput {
  readonly ast: AstReader;
  readonly exactLiteral: CsharpExactLiteralSelectionIndex["exactLiteral"];
  readonly callableCreation: { readonly get: (expression: Node) => CsharpNativeCallableCreation | undefined };
  readonly valueRead: CsharpValueReadClassifications["valueRead"];
  readonly operations: Pick<CsharpTargetOperationClassifications, "binaryOperation" | "operatorForm">;
}

export type CsharpExpectedNativeUsePendingReason = CsharpNativeRepresentationPending | CsharpExpectedUseWithholding
  | "forwarding-owner-unresolved" | "forwarding-cycle" | "inconsistent-request";

export interface CsharpExpectedNativeUseAdmission extends CsharpExpectedNativeUseInput {
  readonly entries: readonly { readonly site: TargetUseSiteRef; readonly use: CsharpExpectedNativeUse }[];
  readonly pending: readonly { readonly site: TargetUseSiteRef; readonly reason: CsharpExpectedNativeUsePendingReason;
    readonly expression?: Node; readonly message?: string }[];
  readonly inactive: readonly TargetUseSiteRef[];
}

export interface CsharpExpectedNativeUseSites {
  readonly requests: readonly CsharpExpectedUseRequest[];
  readonly pending: readonly Extract<CsharpExpectedUseRequest, { readonly kind: "pending" }>[];
  readonly get: (site: TargetUseSiteRef) => readonly CsharpExpectedUseRequest[];
  readonly requestsOf: (expression: Node) => readonly CsharpExpectedUseRequest[];
}

export interface CsharpExpectedTypePropagation {
  readonly propagate: (pending: CsharpExpectedTypePending) => void;
  readonly recordIntrinsicArrayLiteralElements: (node: Node) => void;
  readonly recordIntrinsicObjectLiteralMembers: (node: Node) => void;
  readonly seal: () => {
    readonly issues: readonly CsharpExpectedTypeIssue[];
    readonly arrayLiteralCarrier: (expression: Node, targetType: TargetTypeRef) => TargetTypeRef | undefined;
    readonly constructionCarrier: (expression: Node, targetType: TargetTypeRef) => TargetTypeRef | undefined;
    readonly objectShape: (expression: Node, targetType: TargetTypeRef) => CsharpObjectShapeFact | undefined;
    /** The reason an object literal has no construction at this expected type (its shape construction was rejected). */
    readonly constructionRejection: (expression: Node, targetType: TargetTypeRef) => string | undefined;
    readonly intrinsicTarget: (expression: Node, targetType: TargetTypeRef) => boolean;
    readonly propertyKeyRequests: readonly CsharpExactLiteralRequest[];
    readonly propertyKeys: (expression: Node, carrier: TargetTypeRef) => readonly CsharpNativePropertyKeyBinding[] | undefined;
  };
}

export interface CsharpExpectedUseProjection {
  readonly targetTypes: readonly TargetTypeRef[];
  readonly expectedType: (expression: Node) => readonly TargetTypeRef[];
  readonly requiredExpectedType: (expression: Node) => readonly TargetTypeRef[];
  readonly storageExpectedType: (expression: Node) => readonly TargetTypeRef[];
  readonly quotationBinding: (declaration: Node) => CsharpQuotationBindingSelection | undefined;
  readonly exactIntegerConversion: (expression: Node, targetType: TargetTypeRef) => boolean;
  readonly requests: readonly CsharpExpectedUseRequest[];
}

export interface CsharpExpectedUseCollection {
  readonly record: CsharpExpectedTypeRecord;
  readonly addTargetType: (targetType: TargetTypeRef) => void;
  readonly takePending: () => CsharpExpectedTypePending | undefined;
  readonly recordedUses: (expression: Node) => readonly CsharpExpectedTypeUse[];
  readonly recordQuotationBinding: (declaration: Node, initializer: Node, callable: Node, targetType: TargetTypeRef,
    argumentSite: TargetUseSiteRef) => void;
  readonly quotationBinding: (declaration: Node) => CsharpQuotationBindingSelection | undefined;
  readonly contextualCallables: ReadonlySet<Node>;
  readonly issues: readonly CsharpExpectedTypeIssue[];
  readonly snapshot: () => CsharpExpectedUseProjection;
  readonly seal: () => CsharpExpectedUseProjection;
}
