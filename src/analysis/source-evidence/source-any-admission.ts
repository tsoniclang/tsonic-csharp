import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { IsTypeSyntaxNode, type TargetSourceProgram } from "@tsonic/target-api/source";

function isCheckedValue(ast: AstReader, node: Node): boolean {
  if (ast.is.IsIdentifier(node)) {
    const parent = ast.parent(node);
    if (parent !== undefined && (ast.is.IsQualifiedName(parent) ||
      ast.is.IsImportClause(parent) || ast.is.IsImportSpecifier(parent) || ast.is.IsNamespaceImport(parent) ||
      ast.is.IsExportSpecifier(parent) || ast.is.IsLabeledStatement(parent) ||
      ast.is.IsBreakStatement(parent) || ast.is.IsContinueStatement(parent))) return false;
    return parent === undefined || ast.name(parent) !== node || ast.is.IsShorthandPropertyAssignment(parent);
  }
  return ast.is.IsVariableDeclaration(node) || ast.is.IsParameterDeclaration(node) ||
    ast.is.IsPropertyDeclaration(node) || ast.is.IsPropertySignatureDeclaration(node) ||
    ast.is.IsBindingElement(node) ||
    ast.is.IsPropertyAccessExpression(node) || ast.is.IsElementAccessExpression(node) ||
    ast.is.IsCallExpression(node) || ast.is.IsNewExpression(node) ||
    ast.is.IsAsExpression(node) || ast.is.IsTypeAssertion(node) ||
    ast.is.IsNonNullExpression(node) || ast.is.IsParenthesizedExpression(node) ||
    ast.is.IsAwaitExpression(node) || ast.is.IsYieldExpression(node) ||
    ast.is.IsBinaryExpression(node) || ast.is.IsConditionalExpression(node) ||
    ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node) ||
    ast.is.IsKeywordExpression(node) || ast.is.IsShorthandPropertyAssignment(node) ||
    ast.is.IsSpreadElement(node) || ast.is.IsSpreadAssignment(node) ||
    ast.is.IsTaggedTemplateExpression(node);
}

export function analyzeCsharpSourceAnyAdmission(
  source: TargetSourceProgram,
  sourceNodes: readonly Node[],
): readonly TargetDiagnostic[] {
  const { ast } = source;
  const typeOnly = new Set<Node>();
  for (const node of sourceNodes) {
    const file = ast.getSourceFile(node);
    if (file === undefined || ast.isDeclarationFile(file)) continue;
    const parent = ast.parent(node);
    const inheritedTypeOnly = parent !== undefined && typeOnly.has(parent);
    const typeSyntax = IsTypeSyntaxNode(ast, node);
    const heritageOwner = ast.is.IsExpressionWithTypeArguments(node) && parent !== undefined ? ast.parent(parent) : undefined;
    const typeHeritage = heritageOwner !== undefined && (ast.is.IsInterfaceDeclaration(heritageOwner) ||
      ast.implementsHeritageElements(heritageOwner).includes(node));
    if (inheritedTypeOnly || typeSyntax || ast.is.IsTypeLiteralNode(node) || typeHeritage) typeOnly.add(node);
    const queries = source.semantics.forFile(file);
    const type = typeSyntax ? queries.types.authoredType(node)
      : !inheritedTypeOnly && !typeHeritage && isCheckedValue(ast, node) ? queries.types.expressionType(node) : undefined;
    if (type !== undefined && queries.types.isAny(type)) return Object.freeze([Object.freeze({
      code: "TSONIC_ANY_UNSUPPORTED",
      category: "error" as const,
      source: "tsonic-csharp",
      sourceNode: node,
      message: "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.",
    })]);
  }
  return Object.freeze([]);
}
