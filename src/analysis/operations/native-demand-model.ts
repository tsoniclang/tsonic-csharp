import type { Node } from "@tsonic/tsts";

import type { CsharpNativeConstructInput } from "./control-flow/native-constructs.js";
import type { CsharpNativeOperandInput } from "./control-flow/native-operands.js";

import type { CsharpExpectedNativeUseAdmission } from "../expected-types/model.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/program/declarations.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpExactLiteralSelectionIndex, CsharpNativePropertyKeyBinding } from "../../target-model/conversions/exact-literals.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

import type { CsharpSourceEvidenceResult } from "../source-evidence/model.js";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";

export interface CsharpNativeDemandAnalysisInput extends Omit<CsharpNativeConstructInput, "baseCalls" | "unusedDefault">,
  Omit<CsharpNativeOperandInput, "unusedDefault"> {
  readonly expected: CsharpExpectedNativeUseAdmission;
  readonly declarations: Pick<CsharpDeclarationClassifications, "runtimeDefault">;
  readonly objectShapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">;
  readonly propertyKeyBindings: (expression: Node, carrier: TargetTypeRef) => readonly CsharpNativePropertyKeyBinding[] | undefined;
  readonly exactLiteral: CsharpExactLiteralSelectionIndex["exactLiteral"];
  readonly nativeExpressionIssues: CsharpSourceEvidenceResult["nativeExpressionIssues"];
  readonly sourceStorage: Pick<SourceStorageQueries, "writeAt" | "emptyBindings">;
}
