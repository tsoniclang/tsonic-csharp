import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpConversionMode } from "../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpExpectedNativeUse, CsharpExpectedNativeUseInput, CsharpNativeCallableCreation, CsharpNativeUseSlot } from "../../target-model/records/native-demand.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpNativeRepresentationPending } from "../../target-model/records/native-representation.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callable-values.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/type-projections.js";
import type { CsharpExpectedNativeUseSites } from "./native-uses.js";
import type { CsharpExpectedTypePropagation } from "./propagation.js";

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
