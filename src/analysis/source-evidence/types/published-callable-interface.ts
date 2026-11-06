import type { Node } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpTypePolicyBaseHost } from "./resolution/model.js";

export function publishedCsharpCallableInterface(
  declaration: Node,
  host: Pick<CsharpTypePolicyBaseHost, "ast" | "effectiveTypes" | "navigation" | "semanticsFor">,
): {
  readonly declarations: readonly Node[];
  readonly type: Extract<SourceTypeDescriptor, { readonly kind: "shape" | "callable" }>;
} | undefined {
  if (!host.ast.is.IsInterfaceDeclaration(declaration)) return undefined;
  const publication = host.effectiveTypes.get(declaration);
  if (publication === undefined || publication.kind === "refused" ||
    publication.provenance.occurrence !== declaration || publication.type.kind !== "declared" ||
    publication.type.declaration !== declaration || publication.type.definition === undefined) return undefined;
  const type = sourceTypeDescriptorStructure(publication.type);
  if ((type.kind !== "shape" && type.kind !== "callable") || type.calls.length === 0 ||
    type.constructs.length !== 0 || type.kind === "shape" && (type.members.length !== 0 || type.indexes.length !== 0)) return undefined;
  const file = host.ast.getSourceFile(declaration);
  const symbol = file === undefined ? undefined : host.navigation.declarationSymbol(declaration, file);
  const declarations = symbol === undefined ? [] : host.semanticsFor(declaration).declarations.symbolDeclarations(symbol);
  if (declarations.length === 0 || !declarations.includes(declaration) ||
    declarations.some(candidate => !host.ast.is.IsInterfaceDeclaration(candidate))) return undefined;
  return { declarations, type };
}
