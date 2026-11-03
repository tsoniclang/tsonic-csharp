import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCollectedObjectShapeMembers } from "../../../objects/shapes/member-source.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import { resolveFormedCsharpTypeParameterConstraints, type CsharpTypeParameterConstraintSource } from "./type-parameter-constraints.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpProjectMemberTypeInstantiation } from "../../../../target-model/records/types/project-types.js";
import type { CsharpTypeParameterConstraintResolution } from "../../../../target-model/types/generic-constraints.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { isCsharpIntegralTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { formAuthoredAndSelectedSourceType, resolveFormedAuthoredAndSelectedSourceType,
  resolveSourceTypeDependency, type CsharpAuthoredTypeSelectionEvidence,
  type CsharpSourceTypeDependency } from "./selected-values.js";
import { nextState } from "./state.js";

type CollectedMember = CsharpCollectedObjectShapeMembers["members"][number];

export interface CsharpStructuralPropertyApplication {
  readonly kind: "property";
  readonly authored: readonly CsharpAuthoredTypeSelectionEvidence[];
  readonly numericInitializers: readonly (CsharpSourceTypeDependency | undefined)[] | undefined;
  readonly selected: CsharpSourceTypeDependency;
}

export interface CsharpStructuralMemberApplication {
  readonly source: CollectedMember;
  readonly type:
    | { readonly kind: "method"; readonly dependency: CsharpSourceTypeDependency }
    | CsharpStructuralPropertyApplication;
  readonly value: CsharpSourceTypeDependency | undefined;
  readonly constraints: readonly {
    readonly source: CsharpTypeParameterConstraintSource;
    readonly state: CsharpTypeResolutionState;
  }[];
}

export interface CsharpStructuralTypeSource {
  readonly collection: CsharpCollectedObjectShapeMembers;
  readonly members: readonly CsharpStructuralMemberApplication[];
}

export interface CsharpStructuralTypeApplication extends CsharpStructuralTypeSource {
  readonly source: CsharpStructuralTypeSource;
  readonly receiver: TargetTypeRef | undefined;
}

export interface CsharpStructuralMemberInheritance {
  readonly application: CsharpStructuralTypeApplication;
  readonly member: CsharpStructuralMemberApplication;
  readonly selection: CsharpProjectMemberTypeInstantiation;
}

export interface CsharpCompletedStructuralMemberChildren {
  readonly inheritance: CsharpStructuralMemberInheritance;
  readonly baseType: TargetTypeRef;
  readonly value: {
    readonly request: NonNullable<CsharpStructuralMemberApplication["value"]>;
    readonly type: TargetTypeRef | undefined;
  } | undefined;
  readonly constraints: readonly {
    readonly request: CsharpStructuralMemberApplication["constraints"][number];
    readonly resolution: CsharpTypeParameterConstraintResolution;
  }[];
}

export function formCsharpStructuralPropertyApplication(
  scope: { readonly host: CsharpTypePolicyBaseHost },
  source: {
    readonly sourceType: Type;
    readonly queries: SourceFileSemantics;
    readonly state: CsharpTypeResolutionState;
    readonly authoredTypeNodes: readonly Node[];
    readonly numeric: boolean;
    readonly declarationValues: readonly { readonly declaration: Node; readonly value: Node | undefined }[];
  },
): CsharpStructuralPropertyApplication {
  const { sourceType, queries } = source;
  const sourceFile = queries.sourceFile;
  const state = Object.freeze(nextState(source.state));
  return Object.freeze({ kind: "property",
    authored: Object.freeze(source.authoredTypeNodes.map(node => formAuthoredAndSelectedSourceType(
      scope, node, scope.host.ast.getSourceFile(node) ?? sourceFile, sourceType, sourceFile, state))),
    numericInitializers: !source.numeric ? undefined : Object.freeze(source.declarationValues.map(({ value }) =>
      value === undefined || scope.host.literalValues.literalValue.get(value)?.number !== undefined
        ? undefined : Object.freeze({ kind: "node" as const, node: value, sourceFile, state }))),
    selected: Object.freeze({ kind: "type", type: sourceType, sourceFile, state }),
  });
}

export function formCsharpStructuralTypeApplication(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  collection: CsharpCollectedObjectShapeMembers,
): CsharpStructuralTypeSource {
  const { sourceFile } = collection;
  const valueState = Object.freeze(nextState(collection.state));
  const members = collection.members.map((source): CsharpStructuralMemberApplication => {
    const type: CsharpStructuralMemberApplication["type"] = source.method
      ? Object.freeze({ kind: "method", dependency: Object.freeze({ kind: "type", type: source.propertyType,
          sourceFile, state: Object.freeze(nextState(source.state)),
        }) })
      : formCsharpStructuralPropertyApplication(scope, {
          sourceType: source.propertyType, queries: collection.queries, state: source.state,
          authoredTypeNodes: source.authoredTypeNodes, declarationValues: source.declarationValues,
          numeric: source.authoredTypeNodes.length === 0 &&
            (collection.queries.types.isNumberLike(source.propertyType) || collection.queries.types.isBigIntLike(source.propertyType)),
        });
    return Object.freeze({ source, type,
      value: source.value === undefined ? undefined : Object.freeze({
        kind: "node" as const, node: source.value, sourceFile, state: valueState,
      }),
      constraints: Object.freeze(source.callableDeclaration.typeParameters.map(parameter => Object.freeze({
        source: parameter.constraint, state: valueState,
      }))),
    });
  });
  return Object.freeze({ collection, members: Object.freeze(members) });
}

export function bindCsharpStructuralTypeApplication(
  source: CsharpStructuralTypeSource,
  receiver: TargetTypeRef | undefined,
): CsharpStructuralTypeApplication {
  return Object.freeze({ ...source, source, receiver });
}

export function resolveCsharpStructuralPropertyType(
  scope: CsharpTypeResolutionScope,
  application: CsharpStructuralPropertyApplication,
): TargetTypeRef | undefined {
  if (application.authored.length === 0) {
    if (application.numericInitializers !== undefined) {
      const carriers = application.numericInitializers.map(dependency => dependency === undefined
        ? undefined : resolveSourceTypeDependency(scope, dependency));
      const first = carriers[0];
      if (first !== undefined && isCsharpIntegralTargetType(first) &&
        carriers.every(carrier => carrier !== undefined && targetTypeRefEquals(carrier, first))) return first;
    }
    return resolveSourceTypeDependency(scope, application.selected);
  }
  const carriers = application.authored.map(authored => resolveFormedAuthoredAndSelectedSourceType(scope, authored));
  if (carriers.some(carrier => carrier === undefined)) return undefined;
  const first = carriers[0]!;
  return carriers.every(carrier => carrier !== undefined && targetTypeRefEquals(first, carrier)) ? first : undefined;
}

export function resolveCsharpStructuralMemberChildren(
  scope: CsharpTypeResolutionScope,
  application: CsharpStructuralTypeApplication,
  memberIndex: number,
): CsharpCompletedStructuralMemberChildren | undefined {
  const member = application.members[memberIndex];
  if (application.source.collection !== application.collection || application.source.members !== application.members ||
    application.members.length !== application.collection.members.length ||
    member === undefined || application.collection.members[memberIndex] !== member.source) {
    failTargetAnalysisInvariant("tsonic-csharp", "Structural child completion requires its exact ordered source member.");
  }
  const inheritance = scope.host.structuralTypes.memberInheritance(application, memberIndex);
  if (inheritance.application !== application || inheritance.member !== member) {
    failTargetAnalysisInvariant("tsonic-csharp", "Structural child completion requires the same member's inheritance selection.");
  }
  if (inheritance.selection.kind === "unresolved") return undefined;
  const baseType = inheritance.selection.kind === "resolved" ? inheritance.selection.type
    : member.type.kind === "method" ? resolveSourceTypeDependency(scope, member.type.dependency)
    : resolveCsharpStructuralPropertyType(scope, member.type);
  if (baseType === undefined) return undefined;
  const value = member.value === undefined ? undefined : Object.freeze({
    request: member.value, type: resolveSourceTypeDependency(scope, member.value),
  });
  const { receiver } = application;
  const constraints = member.constraints.map(request => Object.freeze({ request,
    resolution: resolveFormedCsharpTypeParameterConstraints(request.source, dependency => {
      const declared = scope.resolveNodeWithState(dependency.node, dependency.sourceFile, request.state);
      if (declared === undefined || receiver === undefined) return declared;
      const selected = scope.host.projectTypes().instantiateMemberType(member.source.methodDeclaration, receiver, declared);
      return selected.kind === "resolved" ? selected.type : selected.kind === "not-project-member" ? declared : undefined;
    }),
  }));
  return Object.freeze({ inheritance, baseType, value, constraints: Object.freeze(constraints) });
}
