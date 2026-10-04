import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpArrayLiteralElementTargetType, isCsharpRecordDictionaryTargetType } from "../../../target-model/types/collections.js";
import type { CsharpTypePolicyHost } from "./model.js";

export function resolveCsharpContextualLiteralCarrier(
  host: Pick<CsharpTypePolicyHost, "ast" | "objectShapes" | "semanticsFor">,
  node: Node | undefined,
  expected: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (node === undefined) return undefined;
  const carrier = getCsharpNullableElementTargetType(expected) ?? expected;
  if (carrier === undefined) return undefined;
  if (host.ast.is.IsArrayLiteralExpression(node) && host.ast.elements(node).length === 0) {
    return getCsharpArrayLiteralElementTargetType(carrier) !== undefined ||
      carrier.kind === "tuple" && carrier.elements.length === 0 ? carrier : undefined;
  }
  if (!host.ast.is.IsObjectLiteralExpression(node)) return undefined;
  if (isCsharpRecordDictionaryTargetType(carrier)) return carrier;
  const shape = host.objectShapes.resolveTarget(carrier);
  const construction = shape === undefined ? undefined
    : host.objectShapes.resolveObjectLiteralTargetShape(shape, node, host.semanticsFor(node).sourceFile);
  return construction?.kind === "resolved" ? carrier : undefined;
}
