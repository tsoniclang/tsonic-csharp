import type { SourceElementAccessRecord } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { selectedCsharpSourceProfileOwner } from "../../../policy/identities/source-types.js";

/**
 * The JS-profile indexer a Host element access selects: a declared JS indexer (by declaration identity), or an
 * array / typed-array element whose JS collection kind the Host profile publishes (facts.profile.collection).
 */
export function selectCsharpJsIndexer(
  input: Pick<CsharpPolicyContext, "ast" | "facts" | "sourceFacts" | "target">,
  source: SourceElementAccessRecord,
): string | undefined {
  if (source.selected.kind === "member" || source.selected.kind === "index-signature") {
    const identity = csharpSourceProfileDeclarationIdentity(input.ast, input.facts, input.sourceFacts, source.selected.declaration);
    return identity?.owner === "js" && identity.kind === "indexer" ? identity.declaringName : undefined;
  }
  if (source.selected.kind !== "element" || selectedCsharpSourceProfileOwner(input.target) !== "js") return undefined;
  const collection = input.facts.profile.collection(source.receiverType)?.kind;
  return collection === "array" || collection === "readonly-array" ? "Array"
    : collection === "typed-array" ? "TypedArray" : undefined;
}
