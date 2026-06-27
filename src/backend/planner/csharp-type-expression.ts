import {
  AsExpressionWithTypeArguments,
  KindExpressionWithTypeArguments,
  KindIdentifier,
  KindPropertyAccessExpression,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  csharpTargetTypeFromBinding,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  getCsharpTypeForNode,
} from "./csharp-type-node.js";
import {
  invalidCsharpType,
} from "./csharp-type-primitives.js";
import {
  getCsharpTypeFromProjectSourceReferenceNode,
} from "./project-source-types.js";

export function expressionToCsharpType(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) {
    return invalidCsharpType("missing type expression");
  }
  switch (input.ast.kindName(node)) {
    case KindIdentifier:
    case KindPropertyAccessExpression:
      return getCsharpTypeForExpressionReference(node, sourceFile, input, diagnostics);
    case KindExpressionWithTypeArguments: {
      const expression = AsExpressionWithTypeArguments(node)!;
      const rendered = expressionToCsharpType(expression.Expression, sourceFile, input, diagnostics);
      const typeArguments = (expression.TypeArguments?.Nodes ?? [])
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
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  const sourceReferenceType = getCsharpTypeFromProjectSourceReferenceNode(node, sourceFile, input, diagnostics);
  if (sourceReferenceType !== undefined) {
    return sourceReferenceType;
  }
  const targetCarrier = getTargetTypeRefForNode(input, node, sourceFile);
  if (targetCarrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(targetCarrier);
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const targetBinding = input.targetFacts.getTargetBindingForReference(node, { sourceFile });
  if (targetBinding !== undefined) {
    const targetType = csharpTargetTypeFromBinding(targetBinding);
    const csharpType = targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  diagnostics?.push(unsupportedNodeDiagnostic(node, "C# type expression emission requires a provider target binding or a project-source class/interface declaration."));
  return invalidCsharpType("unresolved type expression");
}
