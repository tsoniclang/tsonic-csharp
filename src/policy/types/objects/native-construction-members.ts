import type { Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import type { CsharpTypePolicyBaseHost } from "../resolution/model.js";
import { csharpProviderSelectsNumericStorage } from "./object-shape-policy/provider-construction.js";

export function csharpNativeConstructionMembersMatch(
  sourceType: Type,
  source: CsharpObjectShapeFact | undefined,
  destination: CsharpObjectShapeFact,
  queries: SourceFileSemantics,
  host: Pick<CsharpTypePolicyBaseHost, "ast" | "sourceFacts">,
  reserve: (cost: number) => void,
): boolean {
  reserve((source?.members.length ?? 0) + destination.members.length);
  if (source?.sourceType !== sourceType || destination.sourceType === undefined ||
    destination.constructible !== true || source.methodImplementation !== undefined || source.members.some(member =>
      member.memberKind !== "property" || member.bound === true || member.accessor !== undefined)) return false;
  const declaredKind = source.targetType.kind === "target-named"
    ? (source.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind : undefined;
  if ((declaredKind === "class" || declaredKind === "struct" || declaredKind === "enum") &&
    !targetTypeRefEquals(source.targetType, destination.targetType)) return false;
  const selected = queries.types.structuralMembers(sourceType, destination.sourceType);
  if (selected.kind !== "available" || selected.source.calls.length !== 0 || selected.source.constructs.length !== 0 ||
    selected.source.indexes.length !== 0 || selected.destination.calls.length !== 0 ||
    selected.destination.constructs.length !== 0 || selected.destination.indexes.length !== 0 ||
    selected.members.length !== destination.members.length) return false;
  const sourceMembers = new Set<number>();
  const destinationMembers = new Set<number>();
  const selectionCost = (shape: CsharpObjectShapeFact): number => shape.members.reduce(
    (total, member) => total + 1 + (member.sourceSubjects?.length ?? 0), shape.members.length);
  const sourceSelectionCost = selectionCost(source);
  const destinationSelectionCost = selectionCost(destination);
  for (const pair of selected.members) {
    if (pair.destination.read !== "property") return false;
    reserve(destinationSelectionCost * (1 + pair.destination.property.rootSymbols.length + pair.destination.declarations.length));
    const expected = resolveCsharpObjectShapeMemberBySelectedSubject(destination,
      [pair.destination.property.symbol, ...pair.destination.property.rootSymbols, ...pair.destination.declarations]);
    if (expected.kind !== "resolved") return false;
    const destinationIndex = destination.members.indexOf(expected.member);
    if (destinationMembers.has(destinationIndex)) return false;
    destinationMembers.add(destinationIndex);
    if (pair.kind === "absent") {
      if (expected.member.optional !== true || !pair.destination.property.optional) return false;
      continue;
    }
    if (pair.source.read !== "property" || pair.source.property.optional && !pair.destination.property.optional) return false;
    reserve(sourceSelectionCost * (1 + pair.source.property.rootSymbols.length + pair.source.declarations.length));
    const actual = resolveCsharpObjectShapeMemberBySelectedSubject(source,
      [pair.source.property.symbol, ...pair.source.property.rootSymbols, ...pair.source.declarations]);
    if (actual.kind !== "resolved") return false;
    const sourceIndex = source.members.indexOf(actual.member);
    if (sourceMembers.has(sourceIndex)) return false;
    sourceMembers.add(sourceIndex);
    const sourceElement = getCsharpNullableElementTargetType(actual.member.type);
    const destinationElement = getCsharpNullableElementTargetType(expected.member.type);
    if (sourceElement !== undefined && destinationElement === undefined) return false;
    if (!targetTypeRefEquals(sourceElement ?? actual.member.type, destinationElement ?? expected.member.type) &&
      !(expected.member.exactNumericStorage === true && csharpProviderSelectsNumericStorage(
        pair.source.property, sourceElement ?? actual.member.type, destinationElement ?? expected.member.type,
        { queries, host }))) return false;
  }
  return sourceMembers.size === source.members.length && destinationMembers.size === destination.members.length;
}
