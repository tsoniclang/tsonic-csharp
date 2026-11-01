import type { AstReader, Node } from "@tsonic/tsts";
import { sourceCallableValueExpression } from "@tsonic/target-api/source";
import type { CsharpCallableSourceIdentity, CsharpModuleCallableIdentities } from "../../target-model/records/callables/module-callables.js";

export function analyzeCsharpModuleCallables(ast: AstReader, nodes: readonly Node[]): CsharpModuleCallableIdentities {
  const identities = new Map<Node, CsharpCallableSourceIdentity>();
  for (const declaration of nodes) {
    if (!ast.is.IsVariableDeclaration(declaration)) continue;
    const list = ast.parent(declaration);
    const statement = list === undefined ? undefined : ast.parent(list);
    const owner = statement === undefined ? undefined : ast.parent(statement);
    const name = ast.name(declaration);
    if (list === undefined || statement === undefined || owner === undefined || name === undefined ||
      !ast.is.IsIdentifier(name) || !ast.is.IsVariableStatement(statement) || !ast.is.IsSourceFile(owner) ||
      ast.variableDeclarationKind(list) !== "const") continue;
    const callable = sourceCallableValueExpression(ast, ast.as.AsVariableDeclaration(declaration)?.Initializer,
      { typeAssertions: "transparent" });
    if (callable === undefined || !ast.is.IsArrowFunction(callable) && !ast.is.IsFunctionExpression(callable)) continue;
    const identity = Object.freeze({ callable, sourceOwner: declaration });
    identities.set(declaration, identity);
    identities.set(callable, identity);
  }
  return Object.freeze({ get: (subject: Node) => identities.get(subject) });
}
