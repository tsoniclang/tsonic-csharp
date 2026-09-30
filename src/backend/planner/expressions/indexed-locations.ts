import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypedLocationStorage } from "../../../analysis/operations/index.js";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export function planCsharpIndexedLocation(
  storage: Extract<CsharpTypedLocationStorage, { readonly kind: "reference-indexed-storage" }>,
  planned: CsharpExpression,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const receiverType = csharpTypeFromTargetTypeRef(storage.receiverType, input.scope.typeParameterNames);
  const indexType = csharpTypeFromTargetTypeRef(storage.indexType, input.scope.typeParameterNames);
  if (planned.kind !== "ElementAccessExpression" || planned.arguments.length !== 1 ||
    receiverType === undefined || indexType === undefined) {
    reject(storage.expression, diagnostics);
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression", receiver: planned.receiver, name: storage.method,
    },
    arguments: planned.arguments
      .map(expression => ({ kind: "Argument", expression })),
  };
}

function reject(node: Node, diagnostics: TargetDiagnostic[]): void {
  diagnostics.push(unsupportedNodeDiagnostic(node,
    "The selected indexed location requires one exact receiver, index type and native indexer access."));
}
