import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { isCsharpRecordDictionaryTargetType } from "../../../target-model/types/collections.js";
import type { CsharpTypePolicyHost } from "./model.js";

export function resolveCsharpContextualObjectLiteralCarrier(
  host: Pick<CsharpTypePolicyHost, "ast" | "objectShapes" | "semanticsFor">,
  node: Node | undefined,
  expected: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (node === undefined || !host.ast.is.IsObjectLiteralExpression(node)) return undefined;
  const carrier = getCsharpNullableElementTargetType(expected) ?? expected;
  if (carrier === undefined) return undefined;
  if (isCsharpRecordDictionaryTargetType(carrier)) return carrier;
  const shape = host.objectShapes.resolveTarget(carrier);
  const construction = shape === undefined ? undefined
    : host.objectShapes.resolveObjectLiteralTargetShape(shape, node, host.semanticsFor(node).sourceFile);
  return construction?.kind === "resolved" ? carrier : undefined;
}
