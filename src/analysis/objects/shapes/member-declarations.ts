import type { Node } from "@tsonic/tsts";
import type { CsharpTypePolicyBaseHost } from "../../source-evidence/types/resolution/model.js";
import type { CsharpSourceMemberDeclaration } from "../../../policy/types/source-type-flow/representation.js";

export function selectCsharpMemberDeclaration(
  host: Pick<CsharpTypePolicyBaseHost, "ast" | "navigation" | "hasSemantics" | "semantics" | "memoryBindings">,
  declaration: Node,
): CsharpSourceMemberDeclaration | undefined {
  const file = host.ast.getSourceFile(declaration);
  if (file === undefined || !host.hasSemantics(file)) return undefined;
  const symbol = host.navigation.declarationSymbol(declaration, file);
  const selected = symbol === undefined ? [] : host.semantics(file).declarations.symbolDeclarations(symbol);
  const declarations = selected.includes(declaration) ? selected : [declaration];
  const getters = declarations.filter(node => host.ast.is.IsGetAccessorDeclaration(node));
  const setters = declarations.filter(node => host.ast.is.IsSetAccessorDeclaration(node));
  const accessor = getters.length !== 0 || setters.length !== 0;
  if (accessor && (getters.length !== 1 || setters.length > 1 || !selected.includes(declaration) ||
    declarations.length !== getters.length + setters.length ||
    declarations.some(node => host.ast.parent(node) !== host.ast.parent(declaration)))) return undefined;
  const bound = host.memoryBindings.hasBoundField(declarations);
  if (accessor && bound) return undefined;
  return Object.freeze({
    kind: declarations.some(node => host.ast.is.IsMethodDeclaration(node) || host.ast.is.IsMethodSignatureDeclaration(node))
      ? "method" : "property",
    declarations: Object.freeze([...declarations]),
    bound,
    ...(accessor ? { accessor: Object.freeze({ getter: true as const, setter: setters.length === 1 }) } : {}),
  });
}
