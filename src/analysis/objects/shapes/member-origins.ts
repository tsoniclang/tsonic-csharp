import type { SourceMemberOrigin } from "@tsonic/target-api/source";
import { sourceNumericKeyValuesEqual } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";

export function sourceMemberOriginsEqual(left: SourceMemberOrigin, right: SourceMemberOrigin): boolean {
  if (left === right) return true;
  switch (left.kind) {
    case "declared": return right.kind === "declared" && left.declaration === right.declaration;
    case "class-prototype": return right.kind === "class-prototype" && left.owner === right.owner;
    case "mapped": return right.kind === "mapped" && left.owner === right.owner && left.key.kind === right.key.kind &&
      (left.key.kind === "unique-symbol" ? right.key.kind === "unique-symbol" && left.key.declaration === right.key.declaration
        : left.key.kind === "number" ? right.key.kind === "number" && sourceNumericKeyValuesEqual(left.key.value, right.key.value)
          : right.key.kind === "string" && left.key.value === right.key.value);
  }
}

export function selectCsharpShapeMemberByOrigins(shape: CsharpObjectShapeFact,
  origins: readonly SourceMemberOrigin[]): CsharpObjectShapeMemberFact | undefined {
  if (origins.length === 0) return undefined;
  let selected: CsharpObjectShapeMemberFact | undefined;
  for (const origin of origins) {
    const matches = shape.members.filter(member => member.origins?.some(value => sourceMemberOriginsEqual(value, origin)) === true);
    if (matches.length !== 1 || selected !== undefined && selected !== matches[0]) return undefined;
    selected = matches[0];
  }
  return selected;
}
