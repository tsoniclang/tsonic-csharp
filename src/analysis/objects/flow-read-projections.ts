import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpFlowReadProjection } from "../../policy/types/objects/read-projections.js";
import type { CsharpFlowReadClassifications, CsharpFlowReadProjection, CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";

export function analyzeCsharpFlowReadProjections(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  storage: CsharpStorageClassifications,
): CsharpFlowReadClassifications {
  const projections = new WeakMap<Node, CsharpFlowReadProjection>();
  for (const sourceFile of policy.sourceFiles) visit(sourceFile);
  return Object.freeze({ flowReadProjection: Object.freeze({ get: (node: Node) => projections.get(node) }) });

  function visit(node: Node): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    if (policy.ast.is.IsIdentifier(node) || policy.ast.is.IsPropertyAccessExpression(node) ||
        policy.ast.is.IsElementAccessExpression(node)) {
      const refinement = evidence.valueRefinement.get(node);
      const member = operations.sourceMember.get(node);
      const storageType = (member?.runtimeUnionProperty.kind === "resolved" ? member.runtimeUnionProperty.resultType : member?.rawReadType) ??
        storage.storageType.get(node) ?? evidence.readStorageTargetType.get(node);
      const selectedType = member?.selectedReadType ?? refinement?.flowReadTargetType ??
        operations.operationResultType.get(node) ?? storage.storageType.get(node) ?? evidence.nodeTargetType.get(node);
      projections.set(node, Object.freeze(selectCsharpFlowReadProjection(
        policy, storageType, selectedType, refinement, deferredConstructorFieldRead(policy.ast, node),
      )));
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }
}

function deferredConstructorFieldRead(ast: AstReader, node: Node): boolean {
  if (!ast.is.IsPropertyAccessExpression(node) && !ast.is.IsElementAccessExpression(node)) return false;
  let callable = false;
  for (let current = ast.parent(node); current !== undefined; current = ast.parent(current)) {
    if (ast.is.IsArrowFunction(current) || ast.is.IsFunctionExpression(current)) callable = true;
    if (ast.is.IsMethodDeclaration(current) || ast.is.IsGetAccessorDeclaration(current) || ast.is.IsSetAccessorDeclaration(current)) return false;
    if (ast.is.IsPropertyDeclaration(current) || ast.is.IsConstructorDeclaration(current)) return callable;
    if (ast.is.IsClassDeclaration(current) || ast.is.IsClassExpression(current)) return false;
  }
  return false;
}
