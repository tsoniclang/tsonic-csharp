import type { Type } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceFileSemantics, SourceStructuralMember, SourceStructuralMemberPair } from "@tsonic/target-api/source";
import type { CsharpObjectShapeMemberEvidence, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";

export interface CsharpObjectShapeMemberProofInput {
  readonly sourceSubjects: CsharpObjectShapeMemberFact["sourceSubjects"];
  readonly sourceDeclarations: CsharpObjectShapeMemberFact["sourceDeclarations"];
  readonly sourceTypes: CsharpObjectShapeMemberFact["sourceTypes"];
  readonly sourceMemberEvidence: CsharpObjectShapeMemberFact["sourceMemberEvidence"];
  readonly optional: CsharpObjectShapeMemberFact["optional"];
}

export interface CsharpObjectShapeMemberInstantiationInput {
  readonly members: readonly CsharpObjectShapeMemberProofInput[];
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly previousSourceType: Type | undefined;
}

export type CsharpObjectShapeMemberInstantiationQuery =
  | { readonly kind: "correspondence"; readonly source: Type; readonly destination: Type }
  | { readonly kind: "same-source"; readonly left: Type; readonly right: Type };

export type CsharpCompletedObjectShapeMemberInstantiationQuery = {
  readonly request: CsharpObjectShapeMemberInstantiationQuery;
} & (
  | { readonly kind: "correspondence"; readonly correspondence: ReturnType<SourceFileSemantics["types"]["structuralMembers"]> }
  | { readonly kind: "same-source"; readonly same: boolean }
);

type CsharpObjectShapeMemberInstantiationCompletion<TResult> = Generator<
  CsharpObjectShapeMemberInstantiationQuery,
  TResult,
  CsharpCompletedObjectShapeMemberInstantiationQuery
>;

interface CsharpObjectShapeMemberInstantiation {
  readonly input: CsharpObjectShapeMemberProofInput;
  readonly output: CsharpObjectShapeMemberProofInput;
  readonly pair: SourceStructuralMemberPair;
  readonly retainedAbsence: boolean;
  readonly declaredContext: boolean;
}

export type CsharpObjectShapeMemberInstantiationSource = {
  readonly input: CsharpObjectShapeMemberInstantiationInput;
} & (
  | { readonly kind: "empty"; readonly correspondence: ReturnType<SourceFileSemantics["types"]["structuralMembers"]> }
  | { readonly kind: "members"; readonly members: readonly CsharpObjectShapeMemberInstantiation[] }
);

export function matchesMemberSubjects(
  member: Pick<CsharpObjectShapeMemberFact, "sourceSubjects">,
  selected: SourceStructuralMember,
): boolean {
  const subjects = [selected.property.symbol, ...selected.property.rootSymbols, ...selected.declarations];
  return member.sourceSubjects?.some(subject => subjects.some(candidate => candidate === subject)) === true;
}

function sameCheckedMember(left: SourceStructuralMember, right: SourceStructuralMember): boolean {
  return left.receiverType === right.receiverType && left.property.symbol === right.property.symbol &&
    left.property.type === right.property.type && left.property.optional === right.property.optional &&
    left.property.readonly === right.property.readonly && left.read === right.read &&
    left.property.rootSymbols.length === right.property.rootSymbols.length &&
    left.property.rootSymbols.every((symbol, index) => symbol === right.property.rootSymbols[index]) &&
    left.declarations.length === right.declarations.length &&
    left.declarations.every((declaration, index) => declaration === right.declarations[index]) &&
    left.getters.length === right.getters.length && left.getters.every((getter, index) => getter === right.getters[index]) &&
    left.setters.length === right.setters.length && left.setters.every((setter, index) => setter === right.setters[index]);
}

function* memberCorrespondence(
  source: Type,
  destination: Type,
): CsharpObjectShapeMemberInstantiationCompletion<ReturnType<SourceFileSemantics["types"]["structuralMembers"]>> {
  const request = Object.freeze({ kind: "correspondence" as const, source, destination });
  const completed = yield request;
  if (completed.request !== request || completed.kind !== "correspondence") {
    return failTargetAnalysisInvariant("tsonic-csharp", "Member instantiation requires its exact retained checked correspondence request.");
  }
  return completed.correspondence;
}

function* sameMemberSource(left: Type, right: Type): CsharpObjectShapeMemberInstantiationCompletion<boolean> {
  if (left === right) return true;
  const request = Object.freeze({ kind: "same-source" as const, left, right });
  const completed = yield request;
  if (completed.request !== request || completed.kind !== "same-source") {
    return failTargetAnalysisInvariant("tsonic-csharp", "Member instantiation requires its exact retained checked alias request.");
  }
  return completed.same;
}

function* matchingMemberSources(
  evidence: readonly CsharpObjectShapeMemberEvidence[],
  type: Type,
): CsharpObjectShapeMemberInstantiationCompletion<readonly CsharpObjectShapeMemberEvidence[]> {
  const matching: CsharpObjectShapeMemberEvidence[] = [];
  for (const selected of evidence) if (yield* sameMemberSource(selected.sourceType, type)) matching.push(selected);
  return matching;
}

function* revalidateMemberEvidence(
  member: CsharpObjectShapeMemberProofInput,
  evidence: CsharpObjectShapeMemberEvidence,
): CsharpObjectShapeMemberInstantiationCompletion<SourceStructuralMemberPair | undefined> {
  const previous = evidence.correspondence;
  if (previous.destination.receiverType !== evidence.ownerType ||
    previous.kind === "present" && previous.source.receiverType !== evidence.sourceType ||
    !matchesMemberSubjects(member, previous.destination)) return undefined;
  const checked = yield* memberCorrespondence(evidence.sourceType, evidence.ownerType);
  if (checked.kind !== "available") return undefined;
  const matching = checked.members.filter(pair => pair.destination.property.symbol === previous.destination.property.symbol);
  if (matching.length !== 1) return undefined;
  const selected = matching[0]!;
  if (selected.kind !== previous.kind || !sameCheckedMember(selected.destination, previous.destination)) return undefined;
  return selected.kind === "present" && previous.kind === "present" && !sameCheckedMember(selected.source, previous.source)
    ? undefined : selected;
}

function* completeMemberInstantiation(
  member: CsharpObjectShapeMemberProofInput,
  type: Type,
  previousSourceType: Type,
): CsharpObjectShapeMemberInstantiationCompletion<CsharpObjectShapeMemberInstantiation | undefined> {
  const evidence = member.sourceMemberEvidence;
  if (evidence === undefined || evidence.length === 0) return undefined;
  const exactCurrent = evidence.filter(selected => selected.sourceType === type);
  const exactPrevious = evidence.filter(selected => selected.sourceType === previousSourceType);
  const direct = exactCurrent.length !== 0 ? exactCurrent : exactPrevious.length !== 0 ? exactPrevious
    : yield* matchingMemberSources(evidence, type);
  const candidates = direct.length === 0 ? yield* matchingMemberSources(evidence, previousSourceType) : direct;
  if (candidates.length === 0) return undefined;
  let retained: CsharpObjectShapeMemberEvidence | undefined;
  for (const candidate of candidates) {
    if ((yield* revalidateMemberEvidence(member, candidate)) === undefined || retained !== undefined &&
      (retained.ownerType !== candidate.ownerType || retained.correspondence.destination.property.symbol !==
        candidate.correspondence.destination.property.symbol)) return undefined;
    retained = candidate;
  }
  if (retained === undefined) return undefined;
  const correspondence = yield* memberCorrespondence(type, retained.ownerType);
  if (correspondence.kind !== "available") return undefined;
  const matching = correspondence.members.filter(pair => pair.destination.receiverType === retained.ownerType &&
    pair.destination.property.symbol === retained.correspondence.destination.property.symbol);
  if (matching.length !== 1) return undefined;
  const pair = matching[0]!;
  const retainedAbsence = pair.kind !== "present" && retained.correspondence.kind === "absent" &&
    (yield* sameMemberSource(retained.sourceType, type));
  const declaredContext = pair.kind !== "present" && retained.correspondence.kind === "present" &&
    retained.sourceType === retained.ownerType && previousSourceType === retained.ownerType;
  const sourceMemberEvidence = Object.freeze([retained.sourceType === type && retained.correspondence === pair
    ? retained : Object.freeze({ ownerType: retained.ownerType, sourceType: type, correspondence: pair })]);
  const sourceSubjects = pair.kind !== "present" ? member.sourceSubjects
    : Object.freeze([...new Set([...member.sourceSubjects ?? [], pair.source.property.symbol,
        ...pair.source.property.rootSymbols, ...pair.source.declarations])]);
  const sourceDeclarations = pair.kind !== "present" ? member.sourceDeclarations
    : Object.freeze([...new Set(pair.source.declarations)]);
  const sourceTypes = pair.kind !== "present" ? member.sourceTypes : Object.freeze([pair.source.property.type]);
  return Object.freeze({ input: member,
    output: Object.freeze({ sourceSubjects, sourceDeclarations, sourceTypes, sourceMemberEvidence, optional: member.optional }),
    pair, retainedAbsence, declaredContext });
}

export function* completeMemberInstantiationEvidence(
  input: CsharpObjectShapeMemberInstantiationInput,
): CsharpObjectShapeMemberInstantiationCompletion<CsharpObjectShapeMemberInstantiationSource | undefined> {
  const { members, type, previousSourceType } = input;
  if (previousSourceType === undefined) return undefined;
  if (members.length === 0) return Object.freeze({ kind: "empty", input,
    correspondence: yield* memberCorrespondence(type, previousSourceType) });
  const completed: (CsharpObjectShapeMemberInstantiation | undefined)[] = [];
  for (const member of members) {
    completed.push(yield* completeMemberInstantiation(member, type, previousSourceType));
  }
  return completed.some(member => member === undefined) ? undefined : Object.freeze({ kind: "members", input,
    members: Object.freeze(completed as readonly CsharpObjectShapeMemberInstantiation[]) });
}

export function formMemberInstantiationEvidence(
  input: CsharpObjectShapeMemberInstantiationInput,
): CsharpObjectShapeMemberInstantiationSource | undefined {
  const completion = completeMemberInstantiationEvidence(input);
  let next = completion.next();
  while (!next.done) {
    const request = next.value;
    if (request.kind === "correspondence") {
      next = completion.next(Object.freeze({ request, kind: "correspondence",
        correspondence: input.queries.types.structuralMembers(request.source, request.destination, "correspondence") }));
    } else {
      const symbol = input.queries.declarations.typeSymbol(request.left);
      const same = symbol !== undefined && symbol === input.queries.declarations.typeSymbol(request.right) &&
        input.queries.types.isIdentical(request.left, request.right);
      next = completion.next(Object.freeze({ request, kind: "same-source", same }));
    }
  }
  return next.value;
}

export function instantiateMemberEvidence(
  members: readonly CsharpObjectShapeMemberFact[],
  source: CsharpObjectShapeMemberInstantiationSource,
): readonly CsharpObjectShapeMemberFact[] | undefined {
  if (source.kind === "empty") {
    if (members.length !== 0) return failTargetAnalysisInvariant("tsonic-csharp", "Member instantiation requires the same empty source inventory.");
    return source.correspondence.kind === "available" ? Object.freeze([]) : undefined;
  }
  if (members.length !== source.members.length) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Member instantiation requires every original source member in order.");
  }
  const instantiated = members.map((member, index) => {
    const selected = source.members[index]!;
    if (member.sourceSubjects !== selected.input.sourceSubjects || member.sourceDeclarations !== selected.input.sourceDeclarations ||
      member.sourceTypes !== selected.input.sourceTypes || member.sourceMemberEvidence !== selected.input.sourceMemberEvidence ||
      member.optional !== selected.input.optional) {
      return failTargetAnalysisInvariant("tsonic-csharp", "Member instantiation requires its exact retained source proof input.");
    }
    const { output, pair, retainedAbsence, declaredContext } = selected;
    if (pair.kind !== "present") {
      return member.optional === true && pair.destination.property.optional && (retainedAbsence || declaredContext)
        ? { ...member, sourceMemberEvidence: output.sourceMemberEvidence } : undefined;
    }
    if (pair.source.read === "unavailable") return undefined;
    return { ...member, sourceMemberEvidence: output.sourceMemberEvidence,
      sourceSubjects: output.sourceSubjects, sourceDeclarations: output.sourceDeclarations, sourceTypes: output.sourceTypes };
  });
  return instantiated.some(member => member === undefined) ? undefined
    : Object.freeze(instantiated as readonly CsharpObjectShapeMemberFact[]);
}
