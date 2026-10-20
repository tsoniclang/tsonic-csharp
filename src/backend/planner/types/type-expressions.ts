import type { CsharpPlanningContext } from "../context.js";
import { AsExpressionWithTypeArguments, KindExpressionWithTypeArguments, KindIdentifier, KindPropertyAccessExpression } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { getCsharpTypeForNode } from "./type-node/index.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function expressionToCsharpType(
  node: Node | undefined, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) failCsharpPlannerInvariant("An admitted native type expression requires its exact checked source subject.");
  switch (input.program.source.ast.kindName(node)) {
    case KindIdentifier:
    case KindPropertyAccessExpression:
      return getCsharpTypeForExpressionReference(node, input);
    case KindExpressionWithTypeArguments: {
      const expression = AsExpressionWithTypeArguments(input.program.source.ast, node);
      if (expression === undefined) failCsharpPlannerInvariant("An admitted native generic type expression requires its exact checked syntax.", node);
      const rendered = expressionToCsharpType(expression.Expression, sourceFile, input, diagnostics);
      const typeArguments = input.program.source.ast.typeArguments(expression).map(argument => {
        if (argument === undefined) failCsharpPlannerInvariant("An admitted native type expression requires its dense generic arguments.", node);
        return getCsharpTypeForNode(argument, sourceFile, input, diagnostics);
      });
      if (typeArguments.length === 0) return rendered;
      if (rendered.kind !== "IdentifierName" && rendered.kind !== "QualifiedName")
        failCsharpPlannerInvariant("An admitted native generic type expression requires its exact named destination.", node);
      return { ...rendered, typeArguments };
    }
    default: return getCsharpTypeForNode(node, sourceFile, input, diagnostics);
  }
}

function getCsharpTypeForExpressionReference(node: Node, input: CsharpPlanningContext): CsharpTypeNode {
  const carrier = input.program.records.valueRead.get(node)?.value;
  const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
  if (type === undefined) failCsharpPlannerInvariant("An admitted native type expression requires its exact sealed carrier and syntax.", node);
  return type;
}
