import type { AstReader, Node } from "@tsonic/tsts";
import { sourceCallableValueExpression, type SourceProgramNavigation } from "@tsonic/target-api/source";

export function csharpModuleCallableInitializer(ast: AstReader, declaration: Node): Node | undefined {
  if (!ast.is.IsVariableDeclaration(declaration)) return undefined;
  const list = ast.parent(declaration);
  const statement = list === undefined ? undefined : ast.parent(list);
  const owner = statement === undefined ? undefined : ast.parent(statement);
  const name = ast.name(declaration);
  if (list === undefined || statement === undefined || owner === undefined || name === undefined ||
    !ast.is.IsIdentifier(name) || !ast.is.IsVariableStatement(statement) || !ast.is.IsSourceFile(owner) ||
    ast.variableDeclarationKind(list) !== "const") return undefined;
  const initializer = sourceCallableValueExpression(ast, ast.as.AsVariableDeclaration(declaration)?.Initializer,
    { typeAssertions: "transparent" });
  return initializer !== undefined && (ast.is.IsArrowFunction(initializer) || ast.is.IsFunctionExpression(initializer))
    ? initializer : undefined;
}

export function csharpModuleCallableSource(
  ast: AstReader,
  navigation: Pick<SourceProgramNavigation, "expressionResultDisposition">,
  node: Node,
): { readonly callable: Node; readonly sourceOwner: Node } | undefined {
  const initializer = csharpModuleCallableInitializer(ast, node);
  if (initializer !== undefined) return Object.freeze({ callable: initializer, sourceOwner: node });
  if (!ast.is.IsArrowFunction(node) && !ast.is.IsFunctionExpression(node)) return undefined;
  const disposition = navigation.expressionResultDisposition(node);
  return disposition.kind === "stored" && csharpModuleCallableInitializer(ast, disposition.use) === node
    ? Object.freeze({ callable: node, sourceOwner: disposition.use }) : undefined;
}
