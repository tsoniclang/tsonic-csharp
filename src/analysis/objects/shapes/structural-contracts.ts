import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { canonicalCsharpObjectShapeMembers } from "../../../target-model/types/object-shape-identity.js";
import { createStructuralObjectShapeTarget } from "./construction.js";
import type { CsharpTypeParameterEnvironment } from "../../../target-model/records/types/type-parameter-constraints.js";
import { formCsharpObjectShapeHeader, requireCsharpObjectShapeHeader,
  type CsharpObjectShapeHeader } from "../../../target-model/types/object-shape-header.js";

export interface CsharpStructuralContractHeader {
  readonly input: CsharpObjectShapeHeader;
  readonly header: CsharpObjectShapeHeader;
  readonly shape: CsharpObjectShapeFact;
  readonly templateOrder: readonly number[] | undefined;
}

export function formCsharpStructuralContractHeader(
  shape: CsharpObjectShapeFact,
  environment: CsharpTypeParameterEnvironment,
): CsharpStructuralContractHeader {
  const input = formCsharpObjectShapeHeader(shape);
  if (shape.targetType.kind !== "target-named" || (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true || shape.members.length === 0 ||
    shape.members.some(member => member.memberKind !== "property" || member.bound === true) ||
    (shape.implements?.length ?? 0) !== 0) return Object.freeze({ input, header: input, shape, templateOrder: undefined });
  const ordered = canonicalCsharpObjectShapeMembers(shape.members.map((member, index) => ({ ...member, sourceIndex: index })));
  const templateOrder = Object.freeze(ordered.map(member => member.sourceIndex));
  const members = templateOrder.map(index => shape.members[index]!);
  const declaration = JSON.stringify(members.map(member => [member.sourceKey, member.optional === true,
    member.readonly === true, member.accessor ?? null]));
  const parameters: TargetTypeRef[] = members.map((_member, index) => Object.freeze({ kind: "type-parameter",
    identity: JSON.stringify(["structural-property", declaration, index]), name: `Property${index}`,
    csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([]) }),
  }));
  const templateMembers: CsharpObjectShapeMemberFact[] = members.map((member, index) => ({ ...member, type: parameters[index]! }));
  const targetType = createStructuralObjectShapeTarget(templateMembers, undefined, environment, true);
  if (targetType.kind !== "target-named") failTargetAnalysisInvariant("tsonic-csharp", "A nonempty structural contract lost its native interface identity.");
  const covariantTypeParameterIdentities = templateMembers.flatMap(member =>
    (member.readonly === true || member.accessor?.setter === false) && member.type.kind === "type-parameter"
      ? [member.type.identity] : []);
  const template: CsharpObjectShapeFact = { targetType, members: templateMembers, covariantTypeParameterIdentities };
  const completed = Object.freeze({ ...shape, targetType: { ...targetType, typeArguments: members.map(member => member.type) },
    covariantTypeParameterIdentities, declarationTemplate: template });
  return Object.freeze({ input, header: formCsharpObjectShapeHeader(completed), shape: completed, templateOrder });
}

export function completeCsharpStructuralContractSource(
  native: CsharpStructuralContractHeader,
  source: CsharpObjectShapeFact,
): CsharpObjectShapeFact {
  requireCsharpObjectShapeHeader(native.input, source);
  if (native.templateOrder === undefined) {
    requireCsharpObjectShapeHeader(native.header, source);
    return source;
  }
  const template = native.shape.declarationTemplate;
  if (template === undefined || template.members.length !== native.templateOrder.length) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A structural contract keeps its exact native template member order.");
  }
  const members = template.members.map((member, index) => {
    const selected = source.members[native.templateOrder![index]!];
    if (selected === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A structural contract source requires every header-selected member occurrence.");
    return Object.freeze({ ...member, sourceSubjects: selected.sourceSubjects,
      sourceDeclarations: selected.sourceDeclarations, sourceTypes: selected.sourceTypes,
      sourceMemberEvidence: selected.sourceMemberEvidence });
  });
  const completed = Object.freeze({ ...native.shape, sourceType: source.sourceType, members: source.members,
    declarationTemplate: Object.freeze({ ...template, members: Object.freeze(members) }) });
  requireCsharpObjectShapeHeader(native.header, completed);
  return completed;
}
