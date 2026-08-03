import type {
  CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";

export function getArrayBoundaryCoreCarrierForExpression(
  input: CsharpTranslationContext,
  node: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return input.types.resolveNode(node, sourceFile);
}
