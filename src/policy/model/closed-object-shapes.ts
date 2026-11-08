import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeProjection } from "../../target-model/types/model.js";

export interface CsharpObjectProjectionPolicyInput {
  readonly receiver: CsharpObjectShapeFact;
  readonly projection: CsharpObjectShapeProjection;
  readonly conversions: readonly { readonly source: TargetTypeRef; readonly target: TargetTypeRef; readonly selection: CsharpConversionSelection }[];
}
