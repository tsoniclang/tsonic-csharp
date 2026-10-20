import type {
  CsharpPlanningContext } from "../../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";

export function getArrayBoundaryCoreCarrierForExpression(
  input: CsharpPlanningContext,
  node: Node | undefined,
  _sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return node === undefined ? undefined : input.program.records.valueRead.get(node)?.value;
}
