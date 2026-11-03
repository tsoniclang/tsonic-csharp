import type { Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef } from "../../target-model/types/model.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import { csharpObjectShapeMemberRetainsNativeReference } from "../../policy/types/objects/member-reads.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import type { CsharpTypePolicyBaseHost } from "../source-evidence/types/resolution/model.js";
import { csharpProviderSelectsNumericStorage, formCsharpProviderNumericStorageSource,
  type CsharpProviderNumericStorageSource } from "./shapes/provider-construction.js";
import { csharpObjectShapesEqual } from "../../target-model/types/object-shape-equality.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export interface CsharpNativeConstructionMemberSource {
  readonly sourceType: Type;
  readonly destinationType: Type;
  readonly queries: SourceFileSemantics;
  readonly identical: boolean;
  readonly correspondence: ReturnType<SourceFileSemantics["types"]["structuralMembers"]>;
  readonly numericStorage: readonly (CsharpProviderNumericStorageSource | undefined)[];
}

export function formCsharpNativeConstructionMemberSource(
  sourceType: Type,
  destinationType: Type,
  queries: SourceFileSemantics,
  host: Pick<CsharpTypePolicyBaseHost, "ast" | "sourceFacts">,
): CsharpNativeConstructionMemberSource {
  const identical = queries.types.isIdentical(sourceType, destinationType);
  const correspondence = queries.types.structuralMembers(sourceType, destinationType, "read");
  return Object.freeze({ sourceType, destinationType, queries,
    identical, correspondence,
    numericStorage: Object.freeze(correspondence.kind !== "available" ? [] : correspondence.members.map(pair =>
      pair.kind !== "present" ? undefined : formCsharpProviderNumericStorageSource(pair.source.property, { queries, host }))),
  });
}

export function csharpNativeConstructionMembersMatch(
  input: CsharpNativeConstructionMemberSource,
  source: CsharpObjectShapeFact | undefined,
  destination: CsharpObjectShapeFact,
  reserve: (cost: number) => void,
): boolean {
  const { sourceType } = input;
  reserve((source?.members.length ?? 0) + destination.members.length);
  if (source?.sourceType !== sourceType || destination.sourceType !== input.destinationType ||
    destination.constructible !== true || source.methodImplementation !== undefined || source.members.some(member =>
      member.memberKind !== "property" || member.bound === true || member.accessor !== undefined)) return false;
  const declaredKind = source.targetType.kind === "target-named"
    ? (source.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind : undefined;
  if ((declaredKind === "class" || declaredKind === "struct" || declaredKind === "enum") &&
    !targetTypeRefEquals(source.targetType, destination.targetType)) return false;
  if (input.identical && csharpObjectShapesEqual(source, destination)) return true;
  const selected = input.correspondence;
  if (selected.kind !== "available" || selected.source.calls.length !== 0 || selected.source.constructs.length !== 0 ||
    selected.source.indexes.length !== 0 || selected.destination.calls.length !== 0 ||
    selected.destination.constructs.length !== 0 ||
    selected.destination.indexes.length !== 0 && (source.members.length !== 0 || destination.members.length !== 0) ||
    selected.members.length !== destination.members.length) return false;
  if (input.numericStorage.length !== selected.members.length || selected.members.some((pair, index) =>
    pair.kind === "present" ? input.numericStorage[index]?.property !== pair.source.property
      : input.numericStorage[index] !== undefined)) return failTargetAnalysisInvariant("tsonic-csharp",
        "Construction member completion requires the same ordered numeric source facts.");
  const sourceMembers = new Set<number>();
  const destinationMembers = new Set<number>();
  const selectionCost = (shape: CsharpObjectShapeFact): number => shape.members.reduce(
    (total, member) => total + 1 + (member.sourceSubjects?.length ?? 0), shape.members.length);
  const sourceSelectionCost = selectionCost(source);
  const destinationSelectionCost = selectionCost(destination);
  for (const [index, pair] of selected.members.entries()) {
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
        input.numericStorage[index]!, sourceElement ?? actual.member.type, destinationElement ?? expected.member.type)) &&
      !csharpObjectShapeMemberRetainsNativeReference(sourceElement ?? actual.member.type,
        destinationElement ?? expected.member.type)) return false;
  }
  return sourceMembers.size === source.members.length && destinationMembers.size === destination.members.length;
}
