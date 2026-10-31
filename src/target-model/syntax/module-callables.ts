import type { AstReader, Node } from "@tsonic/tsts";
import { sourceCallableValueExpression } from "@tsonic/target-api/source";

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
