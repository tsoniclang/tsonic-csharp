import type { AstReader, Node } from "@tsonic/tsts";
import { AsCallExpression, AsExpressionStatement, HasSourceKind, KindSuperKeyword } from "@tsonic/target-api/source";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/program/declarations.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage/storage.js";
import type { CsharpCaptureStorage, CsharpOriginalCapturedPlace } from "../../../target-model/records/callables/capture-storage.js";

export function csharpConstructorCapturedPlaces(
  ast: AstReader, constructor: Node, captures: Pick<CsharpCaptureStorage, "lexicalCaptures">,
): readonly CsharpOriginalCapturedPlace[] {
  const body = ast.body(constructor);
  if (body === undefined || csharpConstructorBaseCall(ast, constructor) === undefined) return Object.freeze([]);
  const parameters = ast.parameters(constructor);
  const selected = new Map<Node, { readonly parameter: Node; readonly place: CsharpOriginalCapturedPlace }>();
  for (const closure of captures.lexicalCaptures) for (const place of closure.values) {
    if (place.scope !== body) continue;
    let declaration = place.declaration;
    while (ast.is.IsBindingElement(declaration)) {
      const pattern = ast.parent(declaration);
      const owner = pattern === undefined ? undefined : ast.parent(pattern);
      if (owner === undefined) break;
      declaration = owner;
    }
    if (ast.is.IsParameterDeclaration(declaration) && ast.parent(declaration) === constructor && parameters.includes(declaration)) {
      selected.set(place.declaration, { parameter: declaration, place });
    }
  }
  return Object.freeze(parameters.flatMap(parameter => [...selected.values()]
    .filter(value => value.parameter === parameter).map(value => value.place)));
}

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
