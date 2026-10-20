import type { CsharpTypedLocationStorage } from "../../../target-model/records/typed-location-storage.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";

export function planCsharpIndexedLocation(
  storage: Extract<CsharpTypedLocationStorage, { readonly kind: "reference-indexed-storage" }>,
  receiver: CsharpExpression,
  index: CsharpExpression,
): CsharpExpression {
  return { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver, name: storage.method },
    arguments: [{ kind: "Argument", expression: index }] };
}
