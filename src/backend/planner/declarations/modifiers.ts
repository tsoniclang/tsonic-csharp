import {
  HasSyntacticModifier,
  ModifierFlagsAsync,
} from "@tsonic/target-api/source";
import type { AstReader, Node } from "@tsonic/tsts";

export function isAsyncNode(
  ast: AstReader,
  node: Node,
): boolean {
  return HasSyntacticModifier(ast, node, ModifierFlagsAsync);
}
