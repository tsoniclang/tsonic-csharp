import type { AstReader, Node } from "@tsonic/tsts";
import { HasSourceKind, KindSuperKeyword } from "@tsonic/target-api/source";
import type { CsharpDeclarationClassifications } from "../declarations/model.js";
import type { CsharpStorageClassifications } from "../storage/model.js";

export function csharpConstructorBaseCall(ast: AstReader, constructor: Node): Node | undefined {
  const body = ast.body(constructor);
  const first = body === undefined ? undefined : ast.as.AsBlock(body)?.Statements?.Nodes[0];
  const expression = first === undefined ? undefined : ast.as.AsExpressionStatement(first)?.Expression;
  const call = expression === undefined ? undefined : ast.as.AsCallExpression(expression);
  return call?.Expression !== undefined && HasSourceKind(ast, call.Expression, KindSuperKeyword) ? expression : undefined;
}

export function csharpConstructorRequiresPreparation(
  ast: AstReader, constructor: Node,
  declarations: Pick<CsharpDeclarationClassifications, "runtimeDefault">,
  storage: Pick<CsharpStorageClassifications, "nativeBacking" | "requiresTypedLocationIdentity">,
  captured: (declaration: Node) => boolean,
): boolean {
  if (csharpConstructorBaseCall(ast, constructor) === undefined) return false;
  return ast.parameters(constructor).some(parameter => {
    if (parameter === undefined) return false;
    const name = ast.name(parameter);
    return declarations.runtimeDefault(parameter) !== undefined || storage.nativeBacking(parameter) !== undefined ||
      storage.requiresTypedLocationIdentity(parameter) || captured(parameter) ||
      name !== undefined && (ast.is.IsObjectBindingPattern(name) || ast.is.IsArrayBindingPattern(name));
  });
}
