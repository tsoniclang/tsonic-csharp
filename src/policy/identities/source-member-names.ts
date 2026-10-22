import { createHash } from "node:crypto";
import type { CsharpSourceMemberKey } from "../../target-model/types/model.js";
import { csharpWellKnownSymbolTargetMemberName } from "../../target-model/types/source-member-keys.js";

import { isPlainCsharpIdentifier } from "../../target-model/names/identifiers.js";

/**
 * The native member name of an object-shape property: its source name when that is a plain C# identifier, otherwise a
 * stable name derived from the exact source name (numeric, empty, punctuated and reserved-word keys).
 */
export function objectShapeMemberTargetName(sourceName: string): string {
  return isPlainCsharpIdentifier(sourceName)
    ? sourceName
    : `__tsonic_member_${createHash("sha256").update(sourceName).digest("hex")}`;
}

export function objectShapeMemberTargetNameForKey(
  sourceKey: CsharpSourceMemberKey,
): string | undefined {
  return sourceKey.kind === "property"
    ? objectShapeMemberTargetName(sourceKey.name)
    : csharpWellKnownSymbolTargetMemberName(sourceKey.symbol);
}
