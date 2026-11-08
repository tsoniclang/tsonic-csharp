import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpConversionShapeQueries {
  readonly objectShapes: {
    resolveTarget(carrier: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
  };
}
