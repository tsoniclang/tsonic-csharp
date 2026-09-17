import type { ResolvedSourceObjectLiteralElementInfo } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/runtime-carriers.js";

export function selectCsharpObjectLiteralUnionShape(
  target: TargetTypeRef,
  elements: readonly (ResolvedSourceObjectLiteralElementInfo | undefined)[],
  resolveShape: (type: TargetTypeRef) => CsharpObjectShapeFact | undefined,
): CsharpObjectShapeFact | undefined {
  const arms = getCsharpRuntimeUnionArms(target);
  if (arms === undefined || elements.some(element => element === undefined)) return undefined;
  const candidates = arms.flatMap(arm => {
    const shape = resolveShape(arm);
    if (shape === undefined) return [];
    const selected = elements.map(element => shape.members.filter(member =>
      member.sourceDeclarations?.some(declaration => element!.sourceSelectedDeclarations.includes(declaration)) === true));
    if (selected.some(members => members.length !== 1)) return [];
    const members = new Set(selected.map(matches => matches[0]!));
    if (members.size !== selected.length || shape.members.some(member => !member.optional && !members.has(member))) return [];
    return [shape];
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}
