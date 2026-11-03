import { canonicalCsharpObjectShapeImplementedTypes, canonicalCsharpObjectShapeMembers, csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";

import { csharpEmptyObjectTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import { type CsharpTypeParameterConstraintResolver } from "../../../target-model/types/generic-references.js";
import { csharpObjectShapeTypeParameters, closeCsharpOwnerTypeParameterEnvironment } from "../../source-evidence/types/resolution/owner-type-parameter-environment.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";

import { selectCsharpStructuralObjectCarrier } from "../../../policy/types/objects/shape-carriers.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
export function createStructuralObjectShapeTarget(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  environment: CsharpTypeParameterConstraintResolver,
  contract = false,
  implementation?: CsharpObjectShapeFact["methodImplementation"],
): TargetTypeRef {
  if (members.length === 0 && (implemented?.length ?? 0) === 0) {
    return csharpEmptyObjectTargetType();
  }
  const canonicalMembers = canonicalCsharpObjectShapeMembers(members);
  const canonicalImplemented = canonicalCsharpObjectShapeImplementedTypes(
    (implemented ?? []).filter(type => !members.some(member => member.methodValueContract !== undefined &&
      targetTypeRefKey(member.methodValueContract) === targetTypeRefKey(type))),
  );
  const typeParameters = closeCsharpOwnerTypeParameterEnvironment(csharpObjectShapeTypeParameters(
    canonicalMembers, canonicalImplemented, implementation,
  ), environment);
  return selectCsharpStructuralObjectCarrier(canonicalMembers, canonicalImplemented, typeParameters, contract, implementation);
}

export type CsharpObjectShapeMemberSourceFields = Pick<CsharpObjectShapeMemberFact,
  "sourceSubjects" | "sourceTypes" | "sourceDeclarations" | "sourceMemberEvidence">;

export interface CsharpObjectShapeMemberSourceMerge {
  readonly left: CsharpObjectShapeMemberSourceFields;
  readonly right: CsharpObjectShapeMemberSourceFields;
  readonly fields: CsharpObjectShapeMemberSourceFields;
}

export interface CsharpObjectShapeMemberPair {
  readonly left: CsharpObjectShapeMemberFact;
  readonly right: CsharpObjectShapeMemberFact;
}

export interface CsharpObjectShapeMergeInput {
  readonly left: CsharpObjectShapeFact;
  readonly right: CsharpObjectShapeFact;
  readonly declarationTemplate: CsharpObjectShapeMergeInput | undefined;
  readonly members: readonly CsharpObjectShapeMemberPair[];
}

export interface CsharpObjectShapeSourceMerge {
  readonly input: CsharpObjectShapeMergeInput;
  readonly declarationTemplate: CsharpObjectShapeSourceMerge | undefined;
  readonly members: readonly {
    readonly pair: CsharpObjectShapeMemberPair;
    readonly source: CsharpObjectShapeMemberSourceMerge;
  }[];
}

export function formCsharpObjectShapeMemberSourceMerge(
  left: CsharpObjectShapeMemberSourceFields,
  right: CsharpObjectShapeMemberSourceFields,
): CsharpObjectShapeMemberSourceMerge {
  const subjects = new Set([
    ...(left.sourceSubjects ?? []),
    ...(right.sourceSubjects ?? []),
  ]);
  const sourceTypes = new Set([
    ...(left.sourceTypes ?? []),
    ...(right.sourceTypes ?? []),
  ]);
  const sourceDeclarations = new Set([
    ...(left.sourceDeclarations ?? []),
    ...(right.sourceDeclarations ?? []),
  ]);
  const sourceMemberEvidence = [...(left.sourceMemberEvidence ?? []), ...(right.sourceMemberEvidence ?? [])]
    .filter((evidence, index, alternatives) => alternatives.findIndex(candidate =>
      candidate.ownerType === evidence.ownerType && candidate.sourceType === evidence.sourceType &&
      candidate.correspondence === evidence.correspondence) === index);
  const fields = Object.freeze({
    ...(sourceMemberEvidence.length === 0 ? {} : { sourceMemberEvidence: Object.freeze(sourceMemberEvidence) }),
    ...(subjects.size === 0
      ? {}
      : { sourceSubjects: Object.freeze([...subjects]) }),
    ...(sourceTypes.size === 0
      ? {}
      : { sourceTypes: Object.freeze([...sourceTypes]) }),
    ...(sourceDeclarations.size === 0
      ? {}
      : { sourceDeclarations: Object.freeze([...sourceDeclarations]) }),
  });
  return Object.freeze({ left, right, fields });
}

export function formCsharpObjectShapeMergeInput(
  left: CsharpObjectShapeFact,
  right: CsharpObjectShapeFact,
): CsharpObjectShapeMergeInput {
  const rightMembers = new Map(
    right.members.map((member) => [
      csharpObjectShapeMemberContractKey(member),
      member,
    ]),
  );
  const declarationTemplate = right.declarationTemplate === undefined || left.declarationTemplate === undefined
    ? undefined : formCsharpObjectShapeMergeInput(left.declarationTemplate, right.declarationTemplate);
  const members = left.members.map(member => {
    const other = rightMembers.get(csharpObjectShapeMemberContractKey(member));
    if (other === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A canonical source merge requires its original native-key-selected member pair.");
    return Object.freeze({ left: member, right: other });
  });
  return Object.freeze({ left, right, declarationTemplate, members: Object.freeze(members) });
}

export function formCsharpObjectShapeSourceMerge(
  input: CsharpObjectShapeMergeInput,
): CsharpObjectShapeSourceMerge {
  const declarationTemplate = input.declarationTemplate === undefined
    ? undefined : formCsharpObjectShapeSourceMerge(input.declarationTemplate);
  const members = input.members.map(pair => Object.freeze({ pair,
    source: formCsharpObjectShapeMemberSourceMerge(pair.left, pair.right) }));
  return Object.freeze({ input, declarationTemplate, members: Object.freeze(members) });
}

export function mergeCsharpObjectShapeSubjects(
  source: CsharpObjectShapeSourceMerge,
): CsharpObjectShapeFact {
  const { input } = source;
  const { left, right } = input;
  if (input.members.length !== left.members.length || source.members.length !== input.members.length) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A canonical merge requires every retained member pair in order.");
  }
  if (source.declarationTemplate?.input !== input.declarationTemplate) return failTargetAnalysisInvariant("tsonic-csharp",
    "A canonical merge requires its exact retained template pair input.");
  return {
    ...left,
    ...(left.sourceType === undefined && right.sourceType !== undefined ? { sourceType: right.sourceType } : {}),
    ...(right.declarationTemplate === undefined ? {} : {
      declarationTemplate: source.declarationTemplate === undefined ? right.declarationTemplate
        : mergeCsharpObjectShapeSubjects(source.declarationTemplate),
    }),
    members: input.members.map((pair, index) => {
      const retained = source.members[index]!;
      if (pair.left !== left.members[index] || retained.pair !== pair) return failTargetAnalysisInvariant("tsonic-csharp",
        "A canonical merge requires the same original member pair occurrence.");
      const member = pair.left;
      const other = pair.right;
      const fields = retained.source;
      if (member.sourceSubjects !== fields.left.sourceSubjects || member.sourceTypes !== fields.left.sourceTypes ||
        member.sourceDeclarations !== fields.left.sourceDeclarations || member.sourceMemberEvidence !== fields.left.sourceMemberEvidence ||
        other.sourceSubjects !== fields.right.sourceSubjects || other.sourceTypes !== fields.right.sourceTypes ||
        other.sourceDeclarations !== fields.right.sourceDeclarations || other.sourceMemberEvidence !== fields.right.sourceMemberEvidence) {
        return failTargetAnalysisInvariant("tsonic-csharp", "A canonical source merge requires its exact already-paired source rows.");
      }
      return {
        ...member,
        ...fields.fields,
      };
    }),
  };
}
