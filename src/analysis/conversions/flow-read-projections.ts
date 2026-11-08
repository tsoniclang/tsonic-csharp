import { isCsharpThrowableType } from "../project-types/throwable-types.js";
import { createCsharpFlowReadProjectionProducer } from "../program/records/operations/flow-read-projections.js";
import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpFlowReadProjection } from "../../policy/types/objects/read-projections.js";
import type { CsharpFlowReadClassifications, CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import { csharpRepresentationDiagnostic } from "../source-evidence/representations.js";

export function analyzeCsharpFlowReadProjections(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  valueReads: CsharpValueReadClassifications,
): CsharpFlowReadClassifications {
  const producer = createCsharpFlowReadProjectionProducer();
  const runtimeReads = new WeakMap<Node, ReadonlySet<Node>>();
  const issues: CsharpFlowReadClassifications["issues"][number][] = [];
  for (const sourceFile of policy.sourceFiles) visit(sourceFile);
  return producer.seal(issues);

  function visit(node: Node): void {
    if (evidence.compileTimeMetadata.get(node) || operations.nativeUnreachable.get(node)) return;
    if ((policy.ast.is.IsIdentifier(node) || policy.ast.is.IsPropertyAccessExpression(node) ||
        policy.ast.is.IsElementAccessExpression(node)) && requiresFlowReadProjection(node)) {
      const read = valueReads.valueRead.get(node);
      if (read !== undefined) {
        const refinement = evidence.valueRefinement.get(node);
        if (refinement === undefined) {
          issues.push({ node, code: "CSHARP_FLOW_READ_PROJECTION_NOT_PROVEN", message: "A required Native read has no same-occurrence Source refinement record." });
        } else {
          const projection = selectCsharpFlowReadProjection(policy, policy.representation, refinement,
            deferredConstructorFieldRead(policy.ast, node), isCsharpThrowableType(policy,
              refinement.kind === "represented" ? refinement.value.selected.carrier : undefined));
          if (projection.kind !== "represented") {
            const diagnostic = csharpRepresentationDiagnostic(projection);
            issues.push({ node: diagnostic.sourceNode ?? node, code: diagnostic.code, source: diagnostic.source, message: diagnostic.message });
          } else producer.publish(node, projection.value);
        }
      }
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }

  function requiresFlowReadProjection(node: Node): boolean {
    if (!policy.ast.is.IsIdentifier(node)) {
      const selected = policy.ast.is.IsPropertyAccessExpression(node)
        ? operations.selectedProperty.get(node)?.selection : operations.selectedElement.get(node)?.target;
      if (selected?.kind !== "source-owned" && selected?.kind !== "resolved") return false;
      const use = policy.facts.objects.use(node);
      if (use.kind === "refused") return true;
      if (use.value.access !== "read" && use.value.access !== "read-write") return false;
      if (!use.value.callCallee) return true;
      const invocation = policy.ast.parent(node);
      return invocation !== undefined && operations.selectedCall.get(invocation)?.sourceCall?.kind === "value";
    }
    // The parameter named by a type predicate (`value is Buffer`) is a type position, never a runtime read.
    const parent = policy.ast.parent(node);
    if (parent !== undefined && policy.ast.kindName(parent) === "KindTypePredicate") return false;
    const reference = policy.facts.navigation.sourceReferenceFor(node);
    if (reference === undefined) return false;
    let reads = runtimeReads.get(reference.declaration);
    if (reads === undefined) {
      reads = new Set(policy.facts.navigation.declarationUses(reference.declaration)
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
