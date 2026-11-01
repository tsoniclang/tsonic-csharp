
import { createStructuralObjectShapeTarget } from "./construction.js";


import { selectSourceObjectLiteralAccessors, AsSpreadAssignment } from "@tsonic/target-api/source";

import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { Node, SourceFile } from "@tsonic/tsts";

import { csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";

import { selectCsharpObjectMethodImplementation } from "./method-implementations.js";
import { selectCsharpMethodValueEnvironment } from "../../../policy/types/objects/method-environments.js";

import { csharpObjectShapeMethodRequiresProtocol } from "../../../target-model/types/method-values.js";

import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";

import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";
import type { CsharpObjectLiteralTargetShapeResolution } from "../../../target-model/records/objects/object-shapes.js";

import type { createCsharpObjectShapeMemberResolver } from "./member-evidence.js";

export function createCsharpLiteralShapeResolver(
  host: CsharpObjectShapePolicyHost,
  dependencies: {
    readonly resolveNode: CsharpRecursiveObjectShapePolicy["resolveNode"];
    readonly deriveMembers: ReturnType<typeof createCsharpObjectShapeMemberResolver>["deriveMembers"];
    readonly retainLiteralMemberEvidence: ReturnType<typeof createCsharpObjectShapeMemberResolver>["retainLiteralMemberEvidence"];
    readonly instantiateMemberEvidence: ReturnType<typeof createCsharpObjectShapeMemberResolver>["instantiateMemberEvidence"];
    readonly rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact;
  },
): CsharpRecursiveObjectShapePolicy["resolveObjectLiteralTargetShape"] {
  const { resolveNode, deriveMembers, retainLiteralMemberEvidence, instantiateMemberEvidence, rememberTargetShape } = dependencies;
  const environment = host.typeParameterConstraints;
  function resolveObjectLiteralTargetShape(
    expectedShapes: readonly CsharpObjectShapeFact[],
    objectLiteral: Node,
    sourceFile: SourceFile,
  ): CsharpObjectLiteralTargetShapeResolution {
    const accessors = selectSourceObjectLiteralAccessors(
      host.ast,
      host.semantics(sourceFile),
      objectLiteral,
    );
    if (accessors.kind === "rejected") {
      return {
        kind: "rejected",
        subject: accessors.element,
        reason: accessors.reason,
      };
    }
    const expectedShape = expectedShapes[0];
    if (expectedShape === undefined) {
      if (accessors.kind === "none") {
        return { kind: "not-applicable" };
      }
      const setterOnly = accessors.members.find((member) =>
        member.getter === undefined
      );
      return setterOnly === undefined
        ? {
            kind: "rejected",
            subject: accessors.members[0]!.getter!.element,
            reason:
              "Object-literal accessor has no exact finalized property-shape contract.",
          }
        : {
            kind: "rejected",
            subject: setterOnly.setter!.element,
            reason: `Object-literal setter '${setterOnly.sourceName}' has no getter and therefore no exact native read carrier.`,
          };
    }
    const contracts = new Map<string, TargetTypeRef>();
    for (const expected of expectedShapes) {
      const selected = expected.targetType.kind === "target-named" &&
        ((expected.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface" ||
          (expected.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true)
        ? [expected.targetType] : expected.implements ?? [];
      for (const contract of selected) contracts.set(targetTypeRefKey(contract), contract);
    }
    const implemented = contracts.size === 0 ? expectedShape.implements : [...contracts.values()];
    const queries = host.semantics(sourceFile);
    const sourceType = queries.types.expressionType(objectLiteral);
    if (sourceType === undefined) return {
      kind: "rejected", subject: objectLiteral,
      reason: "Object-literal construction requires exact member correspondence with its declared native contract.",
    };
    const expectedMembers: CsharpObjectShapeMemberFact[] = [];
    for (const expected of expectedShapes) {
      const selected = instantiateMemberEvidence(expected.members, sourceType, queries, expected.sourceType);
      if (selected === undefined) return { kind: "rejected", subject: objectLiteral,
        reason: "Object-literal construction requires exact member correspondence with every declared native contract." };
      for (const member of selected) {
        const index = expectedMembers.findIndex(existing => csharpSourceMemberKeysEqual(existing.sourceKey, member.sourceKey));
        if (index < 0) { expectedMembers.push(member); continue; }
        const existing = expectedMembers[index]!;
        if (existing.memberKind !== member.memberKind || existing.optional !== member.optional ||
            !targetTypeRefEquals(existing.type, member.type)) return { kind: "rejected", subject: objectLiteral,
          reason: `Native construction has conflicting exact identity requirements for member '${member.sourceName}'.` };
        expectedMembers[index] = { ...existing,
          sourceSubjects: Object.freeze([...new Set([...existing.sourceSubjects ?? [], ...member.sourceSubjects ?? []])]),
          sourceDeclarations: Object.freeze([...new Set([...existing.sourceDeclarations ?? [], ...member.sourceDeclarations ?? []])]),
          sourceTypes: Object.freeze([...new Set([...existing.sourceTypes ?? [], ...member.sourceTypes ?? []])]),
          sourceMemberEvidence: Object.freeze([...existing.sourceMemberEvidence ?? [], ...member.sourceMemberEvidence ?? []]),
        };
      }
    }
    const ownShape = expectedShapes.find(expected => expected.sourceType === sourceType);
    const actualMembers = ownShape === undefined
      ? deriveMembers(sourceType, queries, { depth: 0 }, objectLiteral)
      : instantiateMemberEvidence(ownShape.members, sourceType, queries, sourceType);
    if (actualMembers === undefined) return { kind: "rejected", subject: objectLiteral,
      reason: "Object-literal construction requires its original checked member correspondence." };
    const additionalMembers = actualMembers.filter(actual =>
      !expectedMembers.some(expected => csharpSourceMemberKeysEqual(expected.sourceKey, actual.sourceKey)));
    const members = [...retainLiteralMemberEvidence([...expectedMembers, ...additionalMembers], objectLiteral, queries)];
    const nativeMethodLiteral = members.some(member => member.memberKind === "method" &&
      member.sourceDeclarations?.some(declaration => host.ast.is.IsMethodDeclaration(declaration) &&
        host.ast.body(declaration) !== undefined && host.ast.parent(declaration) === objectLiteral) === true);
    const copiedMethods = host.ast.properties(objectLiteral).some(property => property !== undefined &&
      host.ast.is.IsSpreadAssignment(property)) && expectedMembers.some(csharpObjectShapeMethodRequiresProtocol);
    const ownsImplementation = expectedShape.methodImplementation?.declaration === objectLiteral;
    if (expectedShapes.length === 1 && additionalMembers.length === 0 && accessors.kind === "none" &&
      (implemented === expectedShape.implements || implemented?.length === expectedShape.implements?.length &&
        implemented?.every((type, index) => targetTypeRefEquals(type, expectedShape.implements![index]!))) &&
      (!nativeMethodLiteral || ownsImplementation) && !copiedMethods) {
      return { kind: "resolved", shape: rememberTargetShape({ ...expectedShape, sourceType, members }) };
    }
    if (copiedMethods) {
      const sources: { readonly property: Node; readonly shape: CsharpObjectShapeFact }[] = [];
      for (const property of host.ast.properties(objectLiteral)) {
        if (property === undefined || !host.ast.is.IsSpreadAssignment(property)) continue;
        const source = resolveNode(AsSpreadAssignment(host.ast, property)?.Expression, sourceFile);
        if (source === undefined) return { kind: "rejected", subject: property,
          reason: "Copied generic methods require an exact source object environment." };
        sources.push({ property, shape: source });
      }
      const receiver = selectCsharpCopiedMethodReceiver(members, sources.map(source => source.shape), host.ast);
      if (receiver.kind === "rejected") return { kind: "rejected", subject: objectLiteral,
        reason: "Copied receiver-dependent methods require their exact native receiver and authored implementation." };
      if (receiver.kind === "selected") return { kind: "resolved", shape: receiver.shape };
      for (const { shape: source } of sources) {
        for (const sourceMember of source.members) {
          const environment = selectCsharpMethodValueEnvironment(source, sourceMember);
          if (environment === undefined) continue;
          const index = members.findIndex(member => csharpSourceMemberKeysEqual(member.sourceKey, sourceMember.sourceKey));
          if (index < 0) continue;
          const member = members[index]!;
          if (member.sourceDeclarations?.some(declaration => host.ast.parent(declaration) === objectLiteral)) continue;
          members[index] = { ...member, methodValueContract: sourceMember.methodValueContract, methodValueStorage: environment.storage };
        }
      }
    }
    if (accessors.kind === "resolved") {
      for (const accessor of accessors.members) {
        const selectedSubjects = [
          accessor.sourceSelectedSymbol,
          ...accessor.sourceSelectedDeclarations,
        ];
        const selectedTypes = [
          ...(accessor.getter === undefined
            ? []
            : [accessor.getter.sourceSelectedType]),
          ...(accessor.setter === undefined
            ? []
            : [accessor.setter.sourceSelectedType]),
        ];
        const matches = members
          .map((member, index) => ({ member, index }))
          .filter(({ member }) =>
            member.sourceSubjects?.some((subject) =>
              selectedSubjects.some((selected) => selected === subject)
            ) === true &&
            selectedTypes.every((selectedType) =>
              member.sourceTypes?.some((sourceType) =>
                sourceType === selectedType
              ) === true
            )
          );
        if (matches.length !== 1 || matches[0]!.member.memberKind !== "property") {
          return {
            kind: "rejected",
            subject: accessor.getter?.element ?? accessor.setter!.element,
            reason: `Object-literal accessor '${accessor.sourceName}' does not match one exact finalized property-shape member.`,
          };
        }
        const matched = matches[0]!;
        if (accessor.getter === undefined) {
          return {
            kind: "rejected",
            subject: accessor.setter!.element,
            reason: `Object-literal setter '${accessor.sourceName}' has no getter and therefore no exact native read carrier.`,
          };
        }
        if (matched.member.readonly !== true && accessor.setter === undefined) {
          return {
            kind: "rejected",
            subject: accessor.getter.element,
            reason: `Object-literal getter '${accessor.sourceName}' cannot satisfy the selected writable property contract without an exact setter.`,
          };
        }
        members[matched.index] = {
          ...matched.member,
          sourceSubjects: Object.freeze([
            ...(matched.member.sourceSubjects ?? []),
            accessor.sourceSelectedSymbol,
            ...accessor.sourceSelectedDeclarations,
            accessor.getter.element,
            ...(accessor.setter === undefined ? [] : [accessor.setter.element]),
          ]),
          sourceDeclarations: Object.freeze([...new Set([
            ...(matched.member.sourceDeclarations ?? []),
            accessor.getter.element,
            ...(accessor.setter === undefined ? [] : [accessor.setter.element]),
          ])]),
          sourceTypes: Object.freeze([
            ...(matched.member.sourceTypes ?? []),
            accessor.getter.sourceSelectedType,
            accessor.getter.sourceElementType,
            ...(accessor.setter === undefined
              ? []
              : [
                  accessor.setter.sourceSelectedType,
                  accessor.setter.sourceElementType,
                ]),
          ]),
          accessor: {
            getter: true,
            setter: accessor.setter !== undefined,
          },
        };
      }
    }
    const methodImplementation = selectCsharpObjectMethodImplementation(members, host, { depth: 0 }, objectLiteral);
    if (nativeMethodLiteral && methodImplementation === undefined) return {
      kind: "rejected", subject: objectLiteral,
      reason: "Native object methods require one exact authored implementation and closed lexical capture types.",
    };
    const shape = rememberTargetShape({
      targetType: createStructuralObjectShapeTarget(
        members,
        implemented,
        environment,
        false,
        methodImplementation,
      ),
      members,
      ...(sourceType === undefined ? {} : { sourceType }),
      ...(methodImplementation === undefined ? {} : { methodImplementation }),
      ...(implemented === undefined ? {} : { implements: implemented }),
    });
    return { kind: "resolved", shape };
  }

  return resolveObjectLiteralTargetShape;
}
