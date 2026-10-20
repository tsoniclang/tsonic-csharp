import type { CsharpSourceMemberKey } from "../../target-model/types/model.js";
import { csharpWellKnownSymbolTargetMemberName } from "../../target-model/types/source-member-keys.js";

import { tryCsharpIdentifier } from "../../target-model/names/identifiers.js";
export function objectShapeMemberTargetName(sourceName: string): string | undefined {
  return tryCsharpIdentifier(sourceName);
}

export function objectShapeMemberTargetNameForKey(
  sourceKey: CsharpSourceMemberKey,
): string | undefined {
  return sourceKey.kind === "property"
    ? objectShapeMemberTargetName(sourceKey.name)
    : csharpWellKnownSymbolTargetMemberName(sourceKey.symbol);
}
