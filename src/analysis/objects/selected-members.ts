// The declaration a published member or element selection names (selections.memberAccess, values.elementAccess).
import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceElementAccessRecord, SourceMemberAccessSelection } from "@tsonic/target-api/source";

/** The selected member declaration (first merged declaration, authored order) or index signature; undefined for an array, tuple or string element. */
export function csharpSelectedSourceDeclaration(selection: SourceMemberAccessSelection | SourceElementAccessRecord): Node | undefined {
  const selected = selection.selected;
  if (selected.kind === "member") return "declarations" in selected ? selected.declarations[0] : selected.declaration;
  return selected.kind === "index-signature" ? selected.declaration : undefined;
}

/** Every declaration of the selected member (merged declarations in authored order). */
export function csharpSelectedSourceDeclarations(selection: SourceMemberAccessSelection | SourceElementAccessRecord): readonly Node[] {
  const selected = selection.selected;
  if (selected.kind === "member") return "declarations" in selected ? selected.declarations : [selected.declaration];
  return selected.kind === "index-signature" ? [selected.declaration] : [];
}

/** The read/write mode of a selection; a member read that is a call's callee reads the member. */
export function csharpSelectionAccessMode(selection: SourceMemberAccessSelection | SourceElementAccessRecord): "read" | "write" | "read-write" {
  return selection.access === "call" ? "read" : selection.access;
}

/** The selected member or element read is the callee of a call (`o.m()`, `o["m"]()`). */
export function csharpSelectionIsCallee(ast: AstReader, selection: SourceMemberAccessSelection | SourceElementAccessRecord): boolean {
  if (selection.access === "call") return true;
  const site = "use" in selection ? selection.use : selection.node;
  const parent = ast.parent(site);
  return parent !== undefined && ast.is.IsCallExpression(parent) && ast.as.AsCallExpression(parent)?.Expression === site;
}

/** The value declaration of a selected receiver (a namespace, class or enum value), when the Host names one. */
export function csharpSelectionReceiverDeclaration(selection: SourceMemberAccessSelection | SourceElementAccessRecord): Node | undefined {
  return "receiverValue" in selection ? selection.receiverValue?.declaration : undefined;
}
