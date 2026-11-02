import type { AstReader, Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";

export function resolveCsharpBindingSourceType(
  pattern: Node,
  ast: AstReader,
  semanticsFor: (node: Node) => SourceFileSemantics,
): Type | undefined {
  const owner = ast.parent(pattern);
  if (owner === undefined) return undefined;
  const semantics = semanticsFor(owner);
  if (ast.is.IsBindingElement(owner)) {
    const element = ast.as.AsBindingElement(owner);
    const parent = ast.parent(owner);
    const parentType = parent === undefined ? undefined : resolveCsharpBindingSourceType(parent, ast, semanticsFor);
    if (element === undefined || parent === undefined || parentType === undefined) return undefined;
    let selected: Type | undefined;
    if (ast.is.IsObjectBindingPattern(parent)) {
      const property = element.PropertyName ?? element.name;
      let name: string | undefined;
      if (property !== undefined) {
        if (ast.is.IsComputedPropertyName(property) || ast.is.IsNumericLiteral(property)) {
          const selection = semantics.propertyNames.get(property);
          if (selection?.kind === "resolved") name = selection.name;
        } else if (ast.is.IsIdentifier(property) || ast.is.IsStringLiteral(property)) name = ast.text(property);
      }
      const members = name === undefined ? [] : semantics.types.propertyInfos(parentType).filter(member => member.name === name);
      selected = members.length === 1 ? members[0]!.type : undefined;
    } else if (ast.is.IsArrayBindingPattern(parent)) {
      const index = ast.elements(parent).indexOf(owner);
      if (index < 0) return undefined;
      if (semantics.types.isTuple(parentType)) selected = semantics.types.tupleElementInfos(parentType)[index]?.type;
      else {
        const indexes = semantics.types.indexInfos(parentType).filter(info => info.keyType !== undefined && semantics.types.isNumberLike(info.keyType));
        selected = indexes.length === 1 ? indexes[0]!.valueType : undefined;
      }
    }
    return selected === undefined || element.Initializer === undefined ? selected : semantics.types.withoutMissingOrUndefined(selected);
  }
  const declaration = ast.is.IsVariableDeclaration(owner) ? ast.as.AsVariableDeclaration(owner)
    : ast.is.IsParameterDeclaration(owner) ? ast.as.AsParameterDeclaration(owner) : undefined;
  if (declaration?.Type !== undefined) return semantics.types.authoredType(declaration.Type);
  if (ast.is.IsParameterDeclaration(owner)) {
    const callable = ast.parent(owner);
    const signature = callable === undefined ? undefined : semantics.types.declarationSignatureInfo(callable);
    const parameters = signature?.parameters.filter(parameter => parameter.declaration === owner);
    return parameters?.length === 1 ? parameters[0]!.type : undefined;
  }
  const declarations = ast.parent(owner);
  const statement = declarations === undefined ? undefined : ast.parent(declarations);
  if (declarations !== undefined && ast.is.IsVariableDeclarationList(declarations) &&
    statement !== undefined && ast.is.IsForOfStatement(statement) &&
    ast.as.AsForInOrOfStatement(statement)?.Initializer === declarations) {
    return semantics.operations.iteration(statement)?.sourceElementType;
  }
  return declaration?.Initializer === undefined ? undefined : semantics.types.expressionType(declaration.Initializer);
}
