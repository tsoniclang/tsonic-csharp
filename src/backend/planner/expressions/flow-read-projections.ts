import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  type CsharpTargetNamedTypeRef,
  targetTypeRefEquals,
} from "../../../target-model/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  applyCsharpConversionSelection,
} from "./conversions.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";

export function planFlowReadUseSiteProjection(
  node: Node,
  baseExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  options: {
    readonly storageType?: TargetTypeRef;
    readonly selectedType?: TargetTypeRef;
  } = {},
): CsharpExpression | undefined {
  if (input.storageExpression === node) return baseExpression;
  const storageType = options.storageType ??
    input.types.classifications.resolveReadStorage(node, sourceFile);
  const selectedType = options.selectedType ??
    input.types.classifications.resolveNode(node, sourceFile);
  if (storageType === undefined) {
    return baseExpression;
  }
  if (storageType.kind === "type-parameter" && selectedType !== undefined && targetTypeRefEquals(storageType, selectedType) &&
    deferredConstructorFieldRead(node, input)) {
    return { kind: "PostfixUnaryExpression", operand: baseExpression, operatorToken: { kind: "ExclamationToken" } };
  }
  const refinementClassification = input.program.sourceEvidence.valueRefinement(node);
  if (refinementClassification === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning received a source value without finalized refinement evidence.",
    ));
    return undefined;
  }
  const sourceRefinement = refinementClassification.source;
  if (sourceRefinement.kind === "not-project-reference") {
    if (
      selectedType === undefined ||
      targetTypeRefEquals(storageType, selectedType)
    ) {
      return baseExpression;
    }
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A target storage-read projection requires an exact project source declaration.",
    ));
    return undefined;
  }
  if (sourceRefinement.kind === "unresolved") {
    if (
      selectedType === undefined ||
      targetTypeRefEquals(storageType, selectedType)
    ) {
      return baseExpression;
    }
    const missing = sourceRefinement.missing === "declared-type"
      ? "declared type"
      : "selected type";
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `A target storage-read projection requires the exact source ${missing}.`,
    ));
    return undefined;
  }
  if (sourceRefinement.refinement.kind === "exact" &&
    (refinementClassification.flowReadTargetType === undefined ||
      targetTypeRefEquals(storageType, refinementClassification.flowReadTargetType))) {
    return baseExpression;
  }
  if (sourceRefinement.refinement.kind === "ambiguous") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The checked source value refinement is ambiguous, so C# cannot select one storage-read projection.",
    ));
    return undefined;
  }
  if (
    storageType.kind === "target-named" &&
    (storageType as CsharpTargetNamedTypeRef)
        .csharpFlowRefinementRepresentation === "identity"
  ) {
    return baseExpression;
  }
  const refinedSelectedType = refinementClassification.flowReadTargetType;
  if (refinedSelectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact checked source value refinement has no closed C# representation.",
    ));
    return undefined;
  }
  if (targetTypeRefEquals(storageType, refinedSelectedType)) {
    return baseExpression;
  }
  return applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    storageType,
    refinedSelectedType,
    refinementClassification.flowReadConversion ?? {
      kind: "rejected",
      reason: "The sealed C# flow-read classification has no conversion.",
    },
    baseExpression,
  );
}

function deferredConstructorFieldRead(node: Node, input: CsharpPlanningContext): boolean {
  const ast = input.program.source.ast;
  if (!ast.is.IsPropertyAccessExpression(node) && !ast.is.IsElementAccessExpression(node)) return false;
  let callable = false;
  let current = ast.parent(node);
  for (let depth = 0; current !== undefined && depth < 256; depth += 1, current = ast.parent(current)) {
    if (ast.is.IsArrowFunction(current) || ast.is.IsFunctionExpression(current)) callable = true;
    if (ast.is.IsMethodDeclaration(current) || ast.is.IsGetAccessorDeclaration(current) || ast.is.IsSetAccessorDeclaration(current)) return false;
    if (ast.is.IsPropertyDeclaration(current) || ast.is.IsConstructorDeclaration(current)) return callable;
    if (ast.is.IsClassDeclaration(current) || ast.is.IsClassExpression(current)) return false;
  }
  return false;
}
