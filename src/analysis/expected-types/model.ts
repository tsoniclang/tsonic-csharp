import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpNativeUseSlot } from "../../target-model/records/native-demand.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpCallableContractIndex } from "../callables/index.js";

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

export interface CsharpExpectedTypeUse {
  readonly targetType: TargetTypeRef;
  readonly strength: CsharpExpectedTypeStrength;
  readonly exactInteger: boolean;
}

export interface CsharpExpectedTypePending extends CsharpExpectedTypeUse {
  readonly expression: Node;
}

export interface CsharpExpectedUseDemand {
  readonly owner: Node;
  readonly slot: CsharpNativeUseSlot;
  readonly forwardedFrom?: TargetTypeRef;
}

export type CsharpExpectedTypeRecord = (
  expression: Node | undefined,
  targetType: TargetTypeRef | undefined,
  strength: CsharpExpectedTypeStrength,
  demand: CsharpExpectedUseDemand | undefined,
  exactInteger?: boolean,
) => void;
