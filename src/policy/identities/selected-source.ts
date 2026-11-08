import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import { csharpTargetId } from "../../target-model/identities/target.js";

export type CsharpSourceProfileOwner = typeof csharpTargetId | "js";

export interface CsharpSourceProfileDeclarationIdentity {
  readonly owner: CsharpSourceProfileOwner;
  readonly kind: "type" | "member" | "indexer" | "call" | "construct";
  readonly declaringName?: string;
  readonly name?: string;
  readonly declaration: Node;
}

export function csharpSourceProfileDeclarationIdentity(
  navigation: SourceProgramFacts["navigation"],
  declaration: Node | undefined,
): CsharpSourceProfileDeclarationIdentity | undefined {
  if (declaration === undefined) return undefined;
  const selected = navigation.profileDeclaration(declaration);
  if (selected.kind === "none") return undefined;
  const identity = selected.value;
  if (identity.owner !== csharpTargetId && identity.owner !== "js") return undefined;
  return Object.freeze({ ...identity, owner: identity.owner });
}
