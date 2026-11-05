import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { getCsharpArrayLiteralInputCarrierTargetType } from "./array-literal-input.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpNativeSourceCarrierSelection } from "../../../target-model/records/objects/object-shapes.js";

export function csharpArrayLiteralElisionIssue(ast: AstReader, node: Node): Extract<CsharpNativeSourceCarrierSelection, { readonly kind: "rejected" }> | undefined {
  return !ast.is.IsArrayLiteralExpression(node) || !ast.elements(node).some(element =>
    element === undefined || ast.kindName(element) === "KindOmittedExpression") ? undefined : Object.freeze({
    kind: "rejected", subject: node, code: "CSHARP_UNSUPPORTED_AST",
    reason: "Sparse array literal elisions require closed JSArray hole construction facts before C# emission; dense array carriers must not compact holes.",
  });
}

export function selectCsharpArrayLiteralCarrier(
  expected: TargetTypeRef,
  source: TargetTypeRef | undefined,
  definitions?: CsharpTypeDefinitions,
): TargetTypeRef | undefined {
  const value = getCsharpNullableElementTargetType(expected) ?? expected;
  const arms = getCsharpRuntimeUnionArms(value, definitions);
  if (arms === undefined) return getCsharpArrayLiteralInputCarrierTargetType(value, source);
  const candidates = arms.filter(arm => arm.kind === "tuple" || getCsharpArrayLiteralElementTargetType(arm) !== undefined);
  const exact = source === undefined ? [] : candidates.filter(arm => targetTypeRefEquals(arm, source));
  return exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : undefined;
}
