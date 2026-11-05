import type { Node } from "@tsonic/tsts";

export function isCsharpFlowReadEvidenceNode(
  ast: import("@tsonic/tsts").AstReader,
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node);
}

export function freezeSourceArgumentClassification(
  value: import("../../target-model/records/program/source-evidence.js").CsharpSourceArgumentClassification,
): import("../../target-model/records/program/source-evidence.js").CsharpSourceArgumentClassification {
  return value.kind === "resolved"
    ? Object.freeze({
        kind: "resolved",
        argument: Object.freeze({
          passingMode: value.argument.passingMode,
          storageExpression: value.argument.storageExpression,
        }),
      })
    : Object.freeze({
        kind: "rejected",
        reason: value.reason,
      });
}
