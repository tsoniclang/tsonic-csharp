import type { AstReader, Node } from "@tsonic/tsts";
import { sourceTypeDescriptorsEqual, type SourceEffectiveTypes } from "@tsonic/target-api/source";

interface PublishedClassBindings {
  readonly parameters: readonly Node[];
  readonly own: readonly Node[];
  readonly outer: readonly Node[];
}

export function publishedCsharpClassBindings(
  declaration: Node,
  host: { readonly ast: AstReader; readonly effectiveTypes: Pick<SourceEffectiveTypes, "get"> },
): PublishedClassBindings | undefined {
  const { ast } = host;
  if (!ast.is.IsClassDeclaration(declaration) && !ast.is.IsClassExpression(declaration)) return undefined;
  const outcome = host.effectiveTypes.get(declaration);
  const sourceFile = ast.getSourceFile(declaration);
  if (outcome === undefined || outcome.kind === "refused" || outcome.provenance.occurrence !== declaration ||
    sourceFile === undefined || outcome.provenance.sourceFile !== sourceFile) return undefined;
  let descriptor = outcome.type;
  if (descriptor.kind === "callable" || descriptor.kind === "shape") {
    const instance = descriptor.constructs[0]?.result;
    if (descriptor.calls.length !== 0 || instance === undefined ||
      descriptor.constructs.some(signature => !sourceTypeDescriptorsEqual(signature.result, instance))) return undefined;
    descriptor = instance;
  }
  if (descriptor.kind !== "declared" || descriptor.declaration !== declaration) return undefined;
  const own: Node[] = [];
  for (const parameter of ast.typeParameters(declaration)) {
    if (parameter === undefined || !ast.is.IsTypeParameterDeclaration(parameter) ||
      ast.parent(parameter) !== declaration || own.includes(parameter)) return undefined;
    own.push(parameter);
  }
  const lexicalOwners = new Set<Node>();
  for (let owner = ast.parent(declaration); owner !== undefined; owner = ast.parent(owner)) lexicalOwners.add(owner);
  const parameters: Node[] = [];
  const outer: Node[] = [];
  let ownIndex = 0;
  for (const argument of descriptor.typeArguments) {
    if (argument.kind !== "declared" || argument.typeArguments.length !== 0 || argument.definition !== undefined ||
      argument.cut !== undefined || !ast.is.IsTypeParameterDeclaration(argument.declaration) ||
      parameters.includes(argument.declaration)) return undefined;
    const parameter = argument.declaration;
    if (own.includes(parameter)) {
      if (own[ownIndex] !== parameter) return undefined;
      ownIndex += 1;
    } else {
      const owner = ast.parent(parameter);
      if (ownIndex !== 0 || owner === undefined || !lexicalOwners.has(owner) ||
        !ast.typeParameters(owner).includes(parameter)) return undefined;
      outer.push(parameter);
    }
    parameters.push(parameter);
  }
  return ownIndex !== own.length ? undefined : Object.freeze({
    parameters: Object.freeze(parameters), own: Object.freeze(own), outer: Object.freeze(outer),
  });
}
