import { isCsharpThrowableType } from "../project-types/throwable-types.js";
import { createCsharpFlowReadProjectionProducer } from "../program/records/flow-read-projections.js";
import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpFlowReadProjection } from "../../policy/types/objects/read-projections.js";
import type { CsharpFlowReadClassifications, CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import { admitCsharpConversionSelection } from "./validation.js";

export function analyzeCsharpFlowReadProjections(
  policy: Pick<CsharpPolicyContext, "ast" | "sourceFiles" | "navigation" | "typeDefinitions" | "projectTypes" | "providers" | "target"> & {
    readonly objectShapes: Pick<CsharpObjectShapeClassifications, "resolveNode" | "resolveTarget">;
  },
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  valueReads: CsharpValueReadClassifications,
): CsharpFlowReadClassifications {
  const producer = createCsharpFlowReadProjectionProducer();
  const runtimeReads = new WeakMap<Node, ReadonlySet<Node>>();
  const issues: { readonly node: Node; readonly code: string; readonly message: string }[] = [];
  for (const sourceFile of policy.sourceFiles) visit(sourceFile);
  return producer.seal(issues);

  function visit(node: Node): void {
    if (evidence.compileTimeMetadata.get(node) || operations.nativeUnreachable.get(node)) return;
    if ((policy.ast.is.IsIdentifier(node) || policy.ast.is.IsPropertyAccessExpression(node) ||
        policy.ast.is.IsElementAccessExpression(node)) && requiresFlowReadProjection(node)) {
      const read = valueReads.valueRead.get(node);
      const selected = selectCsharpFlowReadProjection(
        policy, read?.flowReadStorage, read?.flowReadValue, evidence.valueRefinement.get(node), deferredConstructorFieldRead(policy.ast, node),
        isCsharpThrowableType(policy, evidence.valueRefinement.get(node)?.flowReadTargetType),
      );
      const projection = selected.kind === "conversion"
        ? { ...selected, selection: admitCsharpConversionSelection(policy, selected.source, selected.target, selected.selection) }
        : selected;
      const failure = projection.kind === "rejected" ? projection
        : projection.kind === "conversion" &&
          (projection.selection.kind === "rejected" || projection.selection.kind === "ambiguous")
          ? projection.selection : undefined;
      if (failure !== undefined) {
        issues.push(Object.freeze({ node, code: "CSHARP_FLOW_READ_PROJECTION_NOT_PROVEN", message: failure.reason }));
      } else if (projection.kind !== "rejected") {
        producer.publish(node, projection);
      }
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }

  function requiresFlowReadProjection(node: Node): boolean {
    if (!policy.ast.is.IsIdentifier(node)) {
      if (operations.sourceMember.get(node) === undefined) return false;
      const selected = policy.ast.is.IsPropertyAccessExpression(node)
        ? operations.selectedProperty.get(node)?.selection : operations.selectedElement.get(node)?.target;
      return selected?.kind === "source-owned" && selected.source.accessMode === "read" && !selected.source.callCallee;
    }
    const reference = policy.navigation.sourceReferenceFor(node);
    if (reference === undefined) return false;
    let reads = runtimeReads.get(reference.declaration);
    if (reads === undefined) {
      reads = new Set(policy.navigation.declarationUses(reference.declaration)
        .filter(use => use.kind !== "type-only" && use.kind !== "source-linkage" &&
          (use.role !== "write" || use.throughMember))
        .map(use => use.reference));
      runtimeReads.set(reference.declaration, reads);
    }
    return reads.has(node);
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
