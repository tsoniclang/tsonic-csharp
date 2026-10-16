import type { Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpNativeConstructInput } from "../../policy/operations/control-flow/native-constructs.js";
import type { CsharpNativeOperandInput } from "../../policy/operations/control-flow/native-operands.js";
import type { CsharpNativeUse, CsharpNativeUseClassifications } from "../../target-model/records/native-demand.js";
import type { CsharpExpectedNativeUseAdmission } from "../expected-types/model.js";

export interface CsharpNativeDemandAnalysisInput extends Omit<CsharpNativeConstructInput, "baseCalls" | "unusedDefault">,
  Omit<CsharpNativeOperandInput, "unusedDefault"> {
  readonly expected: CsharpExpectedNativeUseAdmission;
}

export type CsharpNativeUnadmittedReason =
  | "argument-refused" | "argument-unresolved" | "argument-inconsistent" | "argument-expression-unresolved"
  | "expression-form-unresolved" | "operation-unresolved" | "source-argument-rejected" | "construction-unresolved"
  | "completion-unresolved" | "use-context-unresolved" | "expected-use-pending" | "cyclic-use" | "callable-creation";

export interface CsharpNativeDemandAnalysis extends CsharpNativeUseClassifications {
  readonly entries: readonly { readonly site: TargetUseSiteRef; readonly use: CsharpNativeUse }[];
  readonly unadmitted: readonly { readonly site: TargetUseSiteRef; readonly expression: Node; readonly reason: CsharpNativeUnadmittedReason }[];
}
