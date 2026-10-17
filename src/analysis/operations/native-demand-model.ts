import type { Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpNativeConstructInput } from "../../policy/operations/control-flow/native-constructs.js";
import type { CsharpNativeOperandInput } from "../../policy/operations/control-flow/native-operands.js";
import type { CsharpNativeUse, CsharpNativeUseClassifications } from "../../target-model/records/native-demand.js";
import type { CsharpExpectedNativeUseAdmission } from "../expected-types/model.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpObjectShapeClassifications } from "../objects/model.js";
import type { CsharpExactLiteralSelectionIndex, CsharpNativePropertyKeyBinding } from "../../target-model/conversions/exact-literals.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceEvidenceResult } from "../source-evidence/model.js";
import type { CsharpBindingPatternAnalysis } from "../control-flow/binding-patterns.js";

export interface CsharpNativeDemandAnalysisInput extends Omit<CsharpNativeConstructInput, "baseCalls" | "unusedDefault">,
  Omit<CsharpNativeOperandInput, "unusedDefault"> {
  readonly expected: CsharpExpectedNativeUseAdmission;
  readonly declarations: Pick<CsharpDeclarationClassifications, "runtimeDefault">;
  readonly objectShapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">;
  readonly propertyKeyBindings: (expression: Node, carrier: TargetTypeRef) => readonly CsharpNativePropertyKeyBinding[] | undefined;
  readonly exactLiteral: CsharpExactLiteralSelectionIndex["exactLiteral"];
  readonly nativeExpressionIssues: CsharpSourceEvidenceResult["nativeExpressionIssues"];
  readonly bindingPatterns: CsharpBindingPatternAnalysis;
}

export type CsharpNativeUnadmittedReason =
  | "argument-refused" | "argument-unresolved" | "argument-inconsistent" | "argument-expression-unresolved"
  | "expression-form-unresolved" | "operation-unresolved" | "source-argument-rejected" | "construction-unresolved"
  | "completion-unresolved" | "use-context-unresolved" | "expected-use-pending" | "cyclic-use" | "callable-creation" | "property-key-refused";

export type CsharpNativeUnadmitted =
  | { readonly kind: "pending-use"; readonly site: TargetUseSiteRef; readonly expression: Node;
    readonly reason: CsharpNativeUnadmittedReason; readonly message?: string; readonly code?: string }
  | { readonly kind: "source-refusal"; readonly requiredBy: Node; readonly diagnostic: TargetDiagnostic };

export interface CsharpNativeDemandAnalysis extends CsharpNativeUseClassifications {
  readonly entries: readonly { readonly site: TargetUseSiteRef; readonly use: CsharpNativeUse }[];
  readonly unadmitted: readonly CsharpNativeUnadmitted[];
  readonly requiredBindingRoots: readonly Node[];
  readonly requiredNativeValueDeclarations: readonly Node[];
}
