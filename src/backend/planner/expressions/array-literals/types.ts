import type { TargetTypeRef } from "../../../../target-model/types/native-type-data.js";
import type { CsharpConversionSelection } from "../../../../target-model/conversions/selection.js";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { CsharpSequenceEmission } from "../../../../target-model/records/operations/array-literals.js";
import type { CsharpPlanningContext } from "../../planning-data.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlannedValue } from "../planned-values.js";

export interface ArrayLiteralPlanner {
  readonly planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpPlanningContext,
    diagnostics: TargetDiagnostic[],
  ) => CsharpPlannedValue | undefined;
}

export interface CsharpArraySpreadInput {
  readonly carrier: TargetTypeRef;
  readonly type: CsharpTypeNode;
  readonly expression: CsharpExpression;
  readonly elements: readonly { readonly carrier: TargetTypeRef; readonly type: CsharpTypeNode; readonly conversion: CsharpConversionSelection }[];
  readonly lengthMember: string | undefined;
  readonly sequence: CsharpSequenceEmission;
}

export interface CsharpPlannedArraySpreadInput extends CsharpPlannedValue {
  readonly source: Omit<CsharpArraySpreadInput, "expression">;
}
