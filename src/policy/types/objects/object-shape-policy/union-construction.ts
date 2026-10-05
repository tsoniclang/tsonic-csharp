import type { Node, ResolvedSourceObjectLiteralElementInfo } from "@tsonic/tsts";
import { sourceObjectLiteralDestinationMember, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/nullable.js";
import type { CsharpTypeDefinitions } from "../../../../target-model/types/source-union-definitions.js";
import { isCsharpRecordDictionaryTargetType } from "../../../../target-model/types/collections.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

export function selectCsharpObjectLiteralUnionCarrier(
  target: TargetTypeRef,
  elements: readonly (ResolvedSourceObjectLiteralElementInfo | undefined)[],
  resolveShape: (type: TargetTypeRef) => CsharpObjectShapeFact | undefined,
  destinationDeclarations: (element: ResolvedSourceObjectLiteralElementInfo, shape: CsharpObjectShapeFact) => readonly Node[] | undefined,
  definitions?: CsharpTypeDefinitions,
  source?: TargetTypeRef,
): TargetTypeRef | undefined {
  const arms = getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(target) ?? target, definitions);
  if (arms === undefined || elements.some(element => element === undefined)) return undefined;
  const candidates = arms.flatMap(arm => {
    if (isCsharpRecordDictionaryTargetType(arm)) return [arm];
    const shape = resolveShape(arm);
    if (shape === undefined) return [];
    const selected = elements.map(element => {
      const declarations = destinationDeclarations(element!, shape);
      return declarations === undefined ? [] : shape.members.filter(member =>
        member.sourceDeclarations?.some(declaration => declarations.includes(declaration)) === true);
    });
    if (selected.some(members => members.length !== 1)) return [];
    const members = new Set(selected.map(matches => matches[0]!));
    if (members.size !== selected.length || shape.members.some(member => !member.optional && !members.has(member))) return [];
    return [arm];
  });
  const exact = source === undefined ? [] : candidates.filter(carrier => targetTypeRefEquals(carrier, source));
  return exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : undefined;
}

export function csharpObjectLiteralDestinationDeclarations(
  element: ResolvedSourceObjectLiteralElementInfo,
  shape: CsharpObjectShapeFact,
  semantics: SourceFileSemantics,
): readonly Node[] | undefined {
  if (shape.sourceType === undefined) return undefined;
  return sourceObjectLiteralDestinationMember(element, shape.sourceType, semantics)?.declarations;
}
