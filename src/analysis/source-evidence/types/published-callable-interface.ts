import type { AstReader, Node } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceProgramFacts, type SourceTypeDescriptor } from "@tsonic/target-api/source";

/**
 * A project interface that only declares call signatures (all merged declarations interfaces), with its Host
 * descriptor. Declarations come from the role model (merged entity), the structure from the Host descriptor.
 */
export function publishedCsharpCallableInterface(
  declaration: Node,
  host: { readonly ast: AstReader; readonly facts: SourceProgramFacts },
): {
  readonly declarations: readonly Node[];
  readonly type: Extract<SourceTypeDescriptor, { readonly kind: "shape" | "callable" }>;
} | undefined {
  if (!host.ast.is.IsInterfaceDeclaration(declaration)) return undefined;
  const publication = host.facts.values.type(declaration);
  if (publication.kind === "refused" || publication.provenance.occurrence !== declaration || publication.type.kind !== "declared" ||
    publication.type.declaration !== declaration || publication.type.definition === undefined) return undefined;
  const type = sourceTypeDescriptorStructure(publication.type);
  if ((type.kind !== "shape" && type.kind !== "callable") || type.calls.length === 0 ||
    type.constructs.length !== 0 || type.kind === "shape" && (type.members.length !== 0 || type.indexes.length !== 0)) return undefined;
  const declarations = host.facts.navigation.identity.declarations(declaration);
  if (declarations.length === 0 || !declarations.includes(declaration) ||
    declarations.some(candidate => !host.ast.is.IsInterfaceDeclaration(candidate))) return undefined;
  return { declarations, type };
}
