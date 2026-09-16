import type { Node } from "@tsonic/tsts";
import type { CsharpTypePolicyBaseHost } from "../resolution/model.js";

export function createNullableParameterQuery(host: CsharpTypePolicyBaseHost) {
  const cache = new WeakMap<Node, WeakMap<Node, boolean>>();
  return (declaration: Node, parameter: Node): boolean => {
    let parameters = cache.get(declaration);
    if (parameters === undefined) {
      parameters = new WeakMap();
      cache.set(declaration, parameters);
    }
    const cached = parameters.get(parameter);
    if (cached !== undefined) return cached;
    const result = sourceParameterUsesOnlyNullableCarrier(declaration, parameter, host);
    parameters.set(parameter, result);
    return result;
  };
}

function sourceParameterUsesOnlyNullableCarrier(
  declaration: Node,
  parameter: Node,
  host: CsharpTypePolicyBaseHost,
): boolean {
  const syntax = host.ast.as.AsTypeParameterDeclaration(parameter);
  if (syntax === undefined || syntax.Constraint !== undefined) return false;
  let found = false;
  let valid = true;
  const visit = (node: Node): void => {
    if (!valid || node === parameter) return;
    if (host.ast.is.IsTypeReferenceNode(node)) {
      const name = host.ast.as.AsTypeReferenceNode(node)?.TypeName;
      if (host.navigation.sourceReferenceFor(name)?.declaration === parameter) {
        found = true;
        const parent = host.ast.parent(node);
        const queries = host.semanticsFor(node);
        const type = parent === undefined ? undefined : queries.types.authoredType(parent);
        const members = type !== undefined && queries.types.isUnion(type)
          ? queries.types.unionOrIntersectionTypes(type) : [];
        if (parent === undefined || host.ast.kindName(parent) !== "KindUnionType" ||
          members.length < 2 || members.filter(member => !queries.types.isNullish(member)).length !== 1) {
          valid = false;
        }
      }
    }
    host.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(declaration);
  return found && valid;
}
