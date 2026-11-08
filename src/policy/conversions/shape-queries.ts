import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpObjectShapeFact } from "../../target-model/types/model.js";

export interface CsharpConversionShapeQueries {
  readonly objectShapes: {
    resolveTarget(carrier: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
  };
}
