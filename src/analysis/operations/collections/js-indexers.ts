import type { Node } from "@tsonic/tsts";
import type { SourceElementAccessRecord } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpSourceProfileDeclarationIdentity, type CsharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { sourceUnionRelation } from "../../program/source-facts.js";

/**
 * The one reader of the indexer an element access selects (R4): the profile identity of each Host-selected indexer
 * declaration. A non-union receiver has the declaration of its element record (member, index signature, or the
 * array / typed-array / string index signature the element read selects); a union receiver has the declaration each
 * arm's element read selects (the Host per-arm relation at the access, R6), in Host arm order. undefined: a tuple
 * position, an arm without a selected declaration, or a declaration with no profile identity (no profile indexer).
 */
export function csharpElementIndexerIdentities(
  input: Pick<CsharpPolicyContext, "ast" | "facts">,
  access: SourceElementAccessRecord,
): readonly CsharpSourceProfileDeclarationIdentity[] | undefined {
  const relation = sourceUnionRelation(input.facts, access.node);
  const declarations: readonly (Node | undefined)[] = relation?.kind === "per-arm"
    ? relation.arms.map(arm => arm.member)
    : access.selected.kind === "tuple" ? [undefined] : [access.selected.declaration];
  if (declarations.length === 0) return undefined;
  const identities = declarations.map(declaration =>
    declaration === undefined ? undefined : csharpSourceProfileDeclarationIdentity(input.ast, input.facts, declaration));
  return identities.every((identity): identity is CsharpSourceProfileDeclarationIdentity => identity !== undefined)
    ? Object.freeze(identities) : undefined;
}

/** The declaring name of the one JS-profile indexer every selected declaration of the access names (`Array`, ...). */
export function selectCsharpJsIndexer(
  input: Pick<CsharpPolicyContext, "ast" | "facts">,
  source: SourceElementAccessRecord,
): string | undefined {
  const identities = csharpElementIndexerIdentities(input, source);
  const name = identities?.[0]?.declaringName;
  return name !== undefined && identities!.every(identity => identity.owner === "js" && identity.kind === "indexer" &&
    identity.declaringName === name) ? name : undefined;
}
