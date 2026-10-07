import type { CsharpPolicyContext } from "../model/context.js";

export interface CsharpConversionShapeQueries {
  readonly objectShapes?: Pick<CsharpPolicyContext["objectShapes"], "resolveNode" | "resolveTarget">;
}
