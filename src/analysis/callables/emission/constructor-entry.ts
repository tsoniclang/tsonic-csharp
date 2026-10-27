import type { AstReader, Node } from "@tsonic/tsts";
import { AsCallExpression, AsExpressionStatement, HasSourceKind, KindSuperKeyword } from "@tsonic/target-api/source";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/declarations.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage.js";

export function csharpConstructorBaseCall(ast: AstReader, constructor: Node): Node | undefined {
  const body = ast.body(constructor);
  const first = body === undefined ? undefined : ast.as.AsBlock(body)?.Statements?.Nodes[0];
  const expression = AsExpressionStatement(ast, first)?.Expression;
  const call = AsCallExpression(ast, expression);
  return call?.Expression !== undefined && HasSourceKind(ast, call.Expression, KindSuperKeyword) ? expression : undefined;
}

export function csharpConstructorRequiresPreparation(
  ast: AstReader, constructor: Node,
  declarations: Pick<CsharpDeclarationClassifications, "runtimeDefault">,
  storage: Pick<CsharpStorageClassifications, "nativeBacking" | "typedLocationIdentity">,
  captured: (declaration: Node) => boolean,
): boolean {
  if (csharpConstructorBaseCall(ast, constructor) === undefined) return false;
  return ast.parameters(constructor).some(parameter => {
    if (parameter === undefined) return false;
    const name = ast.name(parameter);
    return declarations.runtimeDefault.get(parameter) !== undefined || storage.nativeBacking.get(parameter) !== undefined ||
      storage.typedLocationIdentity.get(parameter) || captured(parameter) ||
      name !== undefined && (ast.is.IsObjectBindingPattern(name) || ast.is.IsArrayBindingPattern(name));
  });
}
