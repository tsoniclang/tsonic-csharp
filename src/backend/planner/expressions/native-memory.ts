import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { CsharpNativeMemoryLayout } from "../../../target-model/operations/native-memory.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpRuntimeNativeLocationTargetType } from "../../../target-model/types/runtime-carriers.js";

export function planCsharpNativeMemoryCall(
  method: "Allocate" | "ToRaw" | "Reinterpret", value: CsharpExpression, layout: CsharpNativeMemoryLayout,
): CsharpExpression | undefined {
  const pointee = csharpTypeFromTargetTypeRef(layout.pointeeType);
  const owner = csharpTypeFromTargetTypeRef(csharpRuntimeNativeLocationTargetType());
  if (pointee === undefined || owner === undefined) return undefined;
  return { kind: "InvocationExpression", callee: {
    kind: "SimpleMemberAccessExpression",
    receiver: owner,
    name: method, typeArguments: [pointee],
  }, arguments: [value,
    { kind: "NumericLiteralExpression" as const, value: layout.size },
    { kind: "NumericLiteralExpression" as const, value: layout.alignment },
    { kind: "NumericLiteralExpression" as const, value: layout.width },
    { kind: "LiteralExpression" as const, value: layout.littleEndian },
  ].map(expression => ({ kind: "Argument", expression })) };
}
