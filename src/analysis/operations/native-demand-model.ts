import type { Node } from "@tsonic/tsts";

import type { CsharpNativeConstructInput } from "./control-flow/native-constructs.js";
import type { CsharpNativeOperandInput } from "./control-flow/native-operands.js";

import type { CsharpExpectedNativeUseAdmission } from "../expected-types/model.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpExactLiteralSelectionIndex, CsharpNativePropertyKeyBinding } from "../../target-model/conversions/exact-literals.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

import type { CsharpSourceEvidenceResult } from "../source-evidence/model.js";

export interface CsharpNativeDemandAnalysisInput extends Omit<CsharpNativeConstructInput, "baseCalls" | "unusedDefault">,
  Omit<CsharpNativeOperandInput, "unusedDefault"> {
  readonly expected: CsharpExpectedNativeUseAdmission;
  readonly declarations: Pick<CsharpDeclarationClassifications, "runtimeDefault">;
  readonly objectShapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">;
  readonly propertyKeyBindings: (expression: Node, carrier: TargetTypeRef) => readonly CsharpNativePropertyKeyBinding[] | undefined;
  readonly exactLiteral: CsharpExactLiteralSelectionIndex["exactLiteral"];
  readonly nativeExpressionIssues: CsharpSourceEvidenceResult["nativeExpressionIssues"];
}
