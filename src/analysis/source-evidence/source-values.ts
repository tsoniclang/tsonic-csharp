import type { Node, SourceFile } from "@tsonic/tsts";

import type { TargetSourceProgram } from "@tsonic/target-api/source";

import type { CsharpTypePolicy } from "./types/resolution/model.js";

import type { TargetTypeRef } from "../../target-model/types/model.js";

export function isCsharpFlowReadEvidenceNode(
  ast: import("@tsonic/tsts").AstReader,
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node);
}

export function inferCallableReturnType(
  declaration: Node,
  sourceFile: SourceFile,
  source: TargetSourceProgram,
  types: CsharpTypePolicy,
): TargetTypeRef | undefined {
  const semantics = source.semantics.forFile(sourceFile);
  const declarationType = semantics.types.expressionType(declaration);
  if (declarationType === undefined) {
    return undefined;
  }
  const signatures = semantics.types.signatureInfos(declarationType, "call")
    .filter((signature) =>
      semantics.declarations.signatureDeclaration(signature.signature) === declaration);
  return signatures.length === 1
    ? types.resolveType(signatures[0]!.returnType, sourceFile)
    : undefined;
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
