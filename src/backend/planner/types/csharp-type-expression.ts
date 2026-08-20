import type { CsharpPlanningContext } from "../context.js";
import {
  AsExpressionWithTypeArguments,
  KindExpressionWithTypeArguments,
  KindIdentifier,
  KindPropertyAccessExpression,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  getCsharpTypeForNode,
} from "./type-node.js";
import {
  invalidCsharpType,
} from "./csharp-type-primitives.js";

export function expressionToCsharpType(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) {
    return invalidCsharpType("missing type expression");
  }
  switch (input.program.source.ast.kindName(node)) {
    case KindIdentifier:
    case KindPropertyAccessExpression:
      return getCsharpTypeForExpressionReference(node, sourceFile, input, diagnostics);
    case KindExpressionWithTypeArguments: {
      const expression = AsExpressionWithTypeArguments(input.program.source.ast, node)!;
      const rendered = expressionToCsharpType(expression.Expression, sourceFile, input, diagnostics);
      const typeArguments = input.program.source.ast.typeArguments(expression)
        .filter((argument): argument is Node => argument !== undefined)
        .map((argument) => getCsharpTypeForNode(argument, sourceFile, input, invalidCsharpType("missing type argument"), diagnostics));
      if (typeArguments.length === 0) {
        return rendered;
      }
      switch (rendered.kind) {
        case "IdentifierName":
        case "QualifiedName":
          return { ...rendered, typeArguments };
        default:
          return rendered;
      }
    }
    default:
      return getCsharpTypeForNode(node, sourceFile, input, invalidCsharpType("unsupported type expression"), diagnostics);
  }
}

function getCsharpTypeForExpressionReference(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  const targetType = input.types.policy.resolveNode(node, sourceFile);
  const csharpType = targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType);
  if (csharpType !== undefined) {
    return csharpType;
  }
  diagnostics?.push(unsupportedNodeDiagnostic(
    node,
    "C# type expression emission requires an exact provider, source-profile, or project type relation.",
  ));
  return invalidCsharpType("unresolved type expression");
}
