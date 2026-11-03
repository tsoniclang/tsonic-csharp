import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCollectedObjectShapeMembers, CsharpObjectShapeMembersSource } from "../../../objects/shapes/member-source.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import { resolveFormedCsharpTypeParameterConstraints } from "./type-parameter-constraints.js";
import type { CsharpTypeParameterConstraintSource } from "../../../../target-model/records/types/callable-source.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpProjectMemberTypeInstantiation } from "../../../../target-model/records/types/project-types.js";
import type { CsharpTypeParameterConstraintResolution } from "../../../../target-model/types/generic-constraints.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { isCsharpIntegralTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { formCsharpAuthoredTypeSelectionSource, bindCsharpAuthoredTypeSelectionSource, resolveFormedAuthoredAndSelectedSourceType,
  resolveSourceTypeDependency, type CsharpAuthoredTypeSelectionSource, type CsharpAuthoredTypeSelectionEvidence,
  type CsharpSourceTypeDependency } from "./selected-values.js";
import { nextState } from "./state.js";

type CollectedMember = CsharpCollectedObjectShapeMembers["members"][number];

export interface CsharpStructuralPropertySource {
  readonly kind: "property";
  readonly sourceType: Type;
  readonly queries: SourceFileSemantics;
  readonly authored: readonly CsharpAuthoredTypeSelectionSource[];
  readonly numericInitializers: readonly (Node | undefined)[] | undefined;
  readonly dataDeclarations: readonly Node[] | undefined;
}

export interface CsharpStructuralPropertyApplication {
  readonly kind: "property";
  readonly source: CsharpStructuralPropertySource;
  readonly authored: readonly CsharpAuthoredTypeSelectionEvidence[];
  readonly numericInitializers: readonly (CsharpSourceTypeDependency | undefined)[] | undefined;
  readonly dataDeclarations: readonly CsharpSourceTypeDependency[] | undefined;
  readonly selected: CsharpSourceTypeDependency;
}

export interface CsharpStructuralMemberApplication {
  readonly capture: CsharpStructuralMemberSource;
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

export interface CsharpStructuralMemberSource {
  readonly source: CsharpObjectShapeMembersSource["members"][number];
  readonly type: { readonly kind: "method"; readonly type: Type } | CsharpStructuralPropertySource;
}

export interface CsharpStructuralTypeCapture {
  readonly collection: CsharpObjectShapeMembersSource;
  readonly members: readonly CsharpStructuralMemberSource[];
}

export interface CsharpStructuralTypeSource {
  readonly capture: CsharpStructuralTypeCapture;
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
  return bindCsharpStructuralPropertySource(formCsharpStructuralPropertySource(scope, {
    ...source, sourceStorageSubject: source.state.sourceStorageSubject,
  }), source.state);
}

export function formCsharpStructuralPropertySource(
  scope: { readonly host: CsharpTypePolicyBaseHost },
  source: {
    readonly sourceType: Type;
    readonly queries: SourceFileSemantics;
    readonly sourceStorageSubject: CsharpTypeResolutionState["sourceStorageSubject"];
    readonly authoredTypeNodes: readonly Node[];
    readonly numeric: boolean;
    readonly declarationValues: readonly { readonly declaration: Node; readonly value: Node | undefined }[];
  },
): CsharpStructuralPropertySource {
  const { sourceType, queries } = source;
  const sourceFile = queries.sourceFile;
  return Object.freeze({ kind: "property", sourceType, queries,
    authored: Object.freeze(source.authoredTypeNodes.map(node => formCsharpAuthoredTypeSelectionSource(
      scope, node, scope.host.ast.getSourceFile(node) ?? sourceFile, sourceType, sourceFile, source.sourceStorageSubject))),
    numericInitializers: !source.numeric ? undefined : Object.freeze(source.declarationValues.map(({ value }) =>
      value === undefined || scope.host.literalValues.literalValue.get(value)?.number !== undefined
        ? undefined : value)),
    dataDeclarations: source.authoredTypeNodes.length !== 0 || source.numeric || source.declarationValues.length === 0 ||
      !source.declarationValues.every(({ declaration }) => scope.host.ast.is.IsPropertyAssignment(declaration) ||
        scope.host.ast.is.IsShorthandPropertyAssignment(declaration))
      ? undefined : Object.freeze(source.declarationValues.map(({ declaration }) => declaration)),
  });
}

export function bindCsharpStructuralPropertySource(
  source: CsharpStructuralPropertySource,
  state: CsharpTypeResolutionState,
): CsharpStructuralPropertyApplication {
  const childState = Object.freeze(nextState(state));
  const sourceFile = source.queries.sourceFile;
  return Object.freeze({ kind: "property", source,
    authored: Object.freeze(source.authored.map(authored => bindCsharpAuthoredTypeSelectionSource(authored, childState))),
    numericInitializers: source.numericInitializers === undefined ? undefined : Object.freeze(source.numericInitializers.map(node =>
      node === undefined ? undefined : Object.freeze({ kind: "node" as const, node, sourceFile, state: childState }))),
    dataDeclarations: source.dataDeclarations === undefined ? undefined : Object.freeze(source.dataDeclarations.map(node =>
      Object.freeze({ kind: "node" as const, node, sourceFile, state: childState }))),
    selected: Object.freeze({ kind: "type", type: source.sourceType, sourceFile, state: childState }),
  });
}

export function formCsharpStructuralTypeApplication(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  collection: CsharpCollectedObjectShapeMembers,
): CsharpStructuralTypeSource {
  return bindCsharpStructuralTypeCapture(formCsharpStructuralTypeCapture(scope, collection.source), collection);
}

export function formCsharpStructuralTypeCapture(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  collection: CsharpObjectShapeMembersSource,
): CsharpStructuralTypeCapture {
  const members = collection.members.map((source): CsharpStructuralMemberSource => Object.freeze({ source,
    type: source.method ? Object.freeze({ kind: "method", type: source.propertyType })
      : formCsharpStructuralPropertySource(scope, {
          sourceType: source.propertyType, queries: collection.queries, sourceStorageSubject: source.sourceStorageSubject,
          authoredTypeNodes: source.authoredTypeNodes, declarationValues: source.declarationValues,
          numeric: source.authoredTypeNodes.length === 0 &&
            (collection.queries.types.isNumberLike(source.propertyType) || collection.queries.types.isBigIntLike(source.propertyType)),
        }),
  }));
  return Object.freeze({ collection, members: Object.freeze(members) });
}

export function bindCsharpStructuralTypeCapture(
  capture: CsharpStructuralTypeCapture,
  collection: CsharpCollectedObjectShapeMembers,
): CsharpStructuralTypeSource {
  if (collection.source !== capture.collection || collection.members.length !== capture.members.length ||
    collection.members.some((member, index) => member.source !== capture.members[index]?.source)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Structural state binding requires its exact ordered source collection.");
  }
  const { sourceFile } = collection;
  const valueState = Object.freeze(nextState(collection.state));
  const members = collection.members.map((source, index): CsharpStructuralMemberApplication => {
    const member = capture.members[index]!;
    const type: CsharpStructuralMemberApplication["type"] = member.type.kind === "method"
      ? Object.freeze({ kind: "method", dependency: Object.freeze({ kind: "type", type: member.type.type,
          sourceFile, state: Object.freeze(nextState(source.state)),
        }) })
      : bindCsharpStructuralPropertySource(member.type, source.state);
    return Object.freeze({ capture: member, source, type,
      value: source.value === undefined ? undefined : Object.freeze({
        kind: "node" as const, node: source.value, sourceFile, state: valueState,
      }),
      constraints: Object.freeze(source.callableDeclaration.typeParameters.map(parameter => Object.freeze({
        source: parameter.constraint, state: valueState,
      }))),
    });
  });
  return Object.freeze({ capture, collection, members: Object.freeze(members) });
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
    if (application.dataDeclarations !== undefined) {
      const carriers = application.dataDeclarations.map(dependency => resolveSourceTypeDependency(scope, dependency));
      const first = carriers[0];
      return first !== undefined && carriers.every(carrier => carrier !== undefined && targetTypeRefEquals(carrier, first))
        ? first : undefined;
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
    application.source.capture !== application.capture || application.capture.collection !== application.collection.source ||
    application.members.length !== application.collection.members.length ||
    member === undefined || application.collection.members[memberIndex] !== member.source ||
    member.capture !== application.capture.members[memberIndex] || member.capture.source !== member.source.source) {
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
      const selected = scope.host.projectTypeABI().instantiateMemberType(member.source.methodDeclaration, receiver, declared);
      return selected.kind === "resolved" ? selected.type : selected.kind === "not-project-member" ? declared : undefined;
    }),
  }));
  return Object.freeze({ inheritance, baseType, value, constraints: Object.freeze(constraints) });
}
