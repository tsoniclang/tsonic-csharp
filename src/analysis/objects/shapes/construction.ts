import { canonicalCsharpObjectShapeImplementedTypes, canonicalCsharpObjectShapeMembers } from "../../../target-model/types/object-shape-identity.js";

import { csharpEmptyObjectTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import type { CsharpTypeParameterEnvironment } from "../../../target-model/records/types/type-parameter-constraints.js";
import { csharpObjectShapeTypeParameters, closeCsharpOwnerTypeParameterEnvironment } from "../../source-evidence/types/resolution/owner-type-parameter-environment.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";

import { selectCsharpStructuralObjectCarrier } from "../../../policy/types/objects/shape-carriers.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { requireCsharpObjectShapeHeader, type CsharpObjectShapeHeader } from "../../../target-model/types/object-shape-header.js";
import type { CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
export function createStructuralObjectShapeTarget(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  environment: CsharpTypeParameterEnvironment,
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
  readonly left: number;
  readonly right: number;
}

export interface CsharpObjectShapeMergeInput {
  readonly left: CsharpObjectShapeHeader;
  readonly right: CsharpObjectShapeHeader;
  readonly output: CsharpObjectShapeHeader;
  readonly declarationTemplate: CsharpObjectShapeMergeInput | undefined;
  readonly members: readonly CsharpObjectShapeMemberPair[];
}

export interface CsharpObjectShapeProofRowsInput {
  readonly sourceType?: CsharpObjectShapeFact["sourceType"];
  readonly members: readonly CsharpObjectShapeMemberProofInput[];
  readonly declarationTemplate?: CsharpObjectShapeProofRowsInput;
}

export interface CsharpObjectShapeProofRows {
  readonly header: CsharpObjectShapeHeader;
  readonly sourceType: CsharpObjectShapeFact["sourceType"];
  readonly members: readonly CsharpObjectShapeMemberProofInput[];
  readonly declarationTemplate: CsharpObjectShapeProofRows | undefined;
}

export interface CsharpObjectShapeSourceMerge {
  readonly input: CsharpObjectShapeMergeInput;
  readonly left: CsharpObjectShapeProofRows;
  readonly right: CsharpObjectShapeProofRows;
  readonly output: CsharpObjectShapeProofRows;
  readonly declarationTemplate: CsharpObjectShapeSourceMerge | undefined;
  readonly members: readonly {
    readonly pair: CsharpObjectShapeMemberPair;
    readonly source: CsharpObjectShapeMemberSourceMerge;
  }[];
}

export function formCsharpObjectShapeProofRows(
  header: CsharpObjectShapeHeader,
  input: CsharpObjectShapeProofRowsInput,
): CsharpObjectShapeProofRows {
  if (header.contract.members.length !== input.members.length || input.members.some((member, index) =>
    member.optional !== header.contract.members[index]!.optional)) return failTargetAnalysisInvariant("tsonic-csharp",
    "Shape source rows require the exact ordered header inventory.");
  const declarationTemplate = header.declarationTemplate === undefined ? undefined
    : input.declarationTemplate === undefined ? failTargetAnalysisInvariant("tsonic-csharp",
      "Shape source rows require their retained declaration template.")
    : formCsharpObjectShapeProofRows(header.declarationTemplate, input.declarationTemplate);
  return Object.freeze({ header, sourceType: input.sourceType, members: input.members, declarationTemplate });
}

export function requireCsharpObjectShapeProofRows(
  source: CsharpObjectShapeProofRows,
  shape: CsharpObjectShapeFact,
): void {
  requireCsharpObjectShapeHeader(source.header, shape);
  if (source.sourceType !== shape.sourceType || source.members.length !== shape.members.length ||
    source.members.some((input, index) => {
      const member = shape.members[index]!;
      return member.sourceSubjects !== input.sourceSubjects || member.sourceDeclarations !== input.sourceDeclarations ||
        member.sourceTypes !== input.sourceTypes || member.sourceMemberEvidence !== input.sourceMemberEvidence ||
        member.optional !== input.optional;
    })) return failTargetAnalysisInvariant("tsonic-csharp", "Native shape completion requires the exact header-selected source rows.");
  if (source.declarationTemplate === undefined) {
    if (shape.declarationTemplate !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Native shape completion requires genuine declaration-template absence.");
  } else {
    if (shape.declarationTemplate === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Native shape completion requires its original declaration-template source.");
    requireCsharpObjectShapeProofRows(source.declarationTemplate, shape.declarationTemplate);
  }
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
  left: CsharpObjectShapeHeader,
  right: CsharpObjectShapeHeader,
): CsharpObjectShapeMergeInput {
  const rightMembers = new Map(
    right.memberKeys.map((key, index) => [key, index]),
  );
  const declarationTemplate = right.declarationTemplate === undefined || left.declarationTemplate === undefined
    ? undefined : formCsharpObjectShapeMergeInput(left.declarationTemplate, right.declarationTemplate);
  const members = left.memberKeys.map((key, index) => {
    const other = rightMembers.get(key);
    if (other === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A canonical source merge requires its original native-key-selected member pair.");
    return Object.freeze({ left: index, right: other });
  });
  const template = right.declarationTemplate === undefined ? left.declarationTemplate
    : declarationTemplate === undefined ? right.declarationTemplate : declarationTemplate.output;
  const output = Object.freeze({ contract: Object.freeze({ ...left.contract,
    ...(template === undefined ? {} : { declarationTemplate: template.contract }),
  }), targetKey: left.targetKey, memberKeys: left.memberKeys, declarationTemplate: template });
  return Object.freeze({ left, right, output, declarationTemplate, members: Object.freeze(members) });
}

export function formCsharpObjectShapeSourceMerge(
  input: CsharpObjectShapeMergeInput,
  left: CsharpObjectShapeProofRows,
  right: CsharpObjectShapeProofRows,
): CsharpObjectShapeSourceMerge {
  if (left.header !== input.left || right.header !== input.right) return failTargetAnalysisInvariant("tsonic-csharp",
    "Shape source merging requires the exact proof-free header pair.");
  const declarationTemplate = input.declarationTemplate === undefined
    ? undefined : formCsharpObjectShapeSourceMerge(input.declarationTemplate, left.declarationTemplate!, right.declarationTemplate!);
  const members = input.members.map(pair => Object.freeze({ pair,
    source: formCsharpObjectShapeMemberSourceMerge(left.members[pair.left]!, right.members[pair.right]!) }));
  const output = Object.freeze({ header: input.output,
    sourceType: left.sourceType ?? right.sourceType,
    declarationTemplate: right.declarationTemplate === undefined ? left.declarationTemplate
      : declarationTemplate === undefined ? right.declarationTemplate : declarationTemplate.output,
    members: Object.freeze(members.map(({ pair, source }) => Object.freeze({ ...source.fields,
      optional: left.members[pair.left]!.optional,
    }))),
  });
  return Object.freeze({ input, left, right, output, declarationTemplate, members: Object.freeze(members) });
}

export function mergeCsharpObjectShapeSubjects(
  source: CsharpObjectShapeSourceMerge,
  left: CsharpObjectShapeFact,
  right: CsharpObjectShapeFact,
): CsharpObjectShapeFact {
  const { input } = source;
  requireCsharpObjectShapeHeader(input.left, left);
  requireCsharpObjectShapeHeader(input.right, right);
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
        : mergeCsharpObjectShapeSubjects(source.declarationTemplate, left.declarationTemplate!, right.declarationTemplate),
    }),
    members: input.members.map((pair, index) => {
      const retained = source.members[index]!;
      if (pair.left !== index || retained.pair !== pair) return failTargetAnalysisInvariant("tsonic-csharp",
        "A canonical merge requires the same original member pair occurrence.");
      const member = left.members[pair.left]!;
      const other = right.members[pair.right]!;
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
