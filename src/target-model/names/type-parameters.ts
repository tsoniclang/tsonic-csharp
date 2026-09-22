import type { AstReader, Node } from "@tsonic/tsts";

const typeParameterOwnerKinds = new Set([
  "KindClassDeclaration", "KindClassExpression", "KindInterfaceDeclaration", "KindTypeAliasDeclaration",
  "KindFunctionDeclaration", "KindFunctionExpression", "KindArrowFunction", "KindMethodDeclaration", "KindMethodSignature",
  "KindFunctionType", "KindConstructorType", "KindCallSignature", "KindConstructSignature",
]);

export function csharpSourceTypeParameters(node: Node, ast: AstReader): readonly (Node | undefined)[] {
  return typeParameterOwnerKinds.has(ast.kindName(node)) ? ast.typeParameters(node) : [];
}

export function csharpSourceTypeParameterName(declaration: Node, ast: AstReader): string | undefined {
  if (!ast.is.IsTypeParameterDeclaration(declaration)) return undefined;
  const nameNode = ast.name(declaration);
  const owner = ast.parent(declaration);
  if (nameNode === undefined || owner === undefined) return undefined;
  const name = ast.text(nameNode);
  const occupied = new Set<string>();
  for (let ancestor = ast.parent(owner); ancestor !== undefined; ancestor = ast.parent(ancestor)) {
    for (const parameter of csharpSourceTypeParameters(ancestor, ast)) {
      if (parameter === undefined) return undefined;
      const selected = csharpSourceTypeParameterName(parameter, ast);
      if (selected === undefined) return undefined;
      occupied.add(selected);
    }
  }
  if (!occupied.has(name)) return name;
  for (const parameter of ast.typeParameters(owner)) {
    const siblingName = parameter === undefined ? undefined : ast.name(parameter);
    if (siblingName === undefined) return undefined;
    occupied.add(ast.text(siblingName));
  }
  let suffix = 2;
  while (occupied.has(`${name}${suffix}`)) suffix++;
  return `${name}${suffix}`;
}
