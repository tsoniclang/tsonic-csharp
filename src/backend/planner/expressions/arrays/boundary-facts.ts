import type {
  CsharpPlanningContext } from "../../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../policy/types/index.js";

export function getArrayBoundaryCoreCarrierForExpression(
  input: CsharpPlanningContext,
  node: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return input.types.resolveNode(node, sourceFile);
}
