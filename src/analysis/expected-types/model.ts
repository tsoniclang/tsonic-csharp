import type { Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpConversionMode } from "../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpNativeUseSlot } from "../../target-model/records/native-demand.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpCallableContractIndex } from "../callables/index.js";
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
  readonly declarations: Pick<CsharpDeclarationClassifications, "returnContract">;
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
