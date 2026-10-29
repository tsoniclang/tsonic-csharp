
import { createStructuralObjectShapeTarget } from "./construction.js";


import { selectSourceObjectLiteralAccessors, AsSpreadAssignment } from "@tsonic/target-api/source";

import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";

import { csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";

import { selectCsharpObjectMethodImplementation } from "./method-implementations.js";
import { selectCsharpMethodValueEnvironment } from "../../../policy/types/objects/method-environments.js";

import { csharpObjectShapeMethodRequiresProtocol } from "../../../target-model/types/method-values.js";

import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";

import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";
import type { CsharpObjectLiteralTargetShapeResolution } from "../../../target-model/records/objects/object-shapes.js";

import type { createCsharpObjectShapeMemberResolver } from "./member-evidence.js";
import { selectCsharpLiteralDeclarationContext } from "../native-construction-demand.js";
import { instantiateCsharpObjectShape } from "../../../policy/types/objects/instantiation.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";

export function createCsharpLiteralShapeResolver(
  host: CsharpObjectShapePolicyHost,
  dependencies: {
    readonly resolveNode: CsharpRecursiveObjectShapePolicy["resolveNode"];
    readonly resolveType: CsharpRecursiveObjectShapePolicy["resolveType"];
    readonly literalSourceType: (node: Node) => Type | undefined;
    readonly retainLiteralMemberEvidence: ReturnType<typeof createCsharpObjectShapeMemberResolver>["retainLiteralMemberEvidence"];
    readonly instantiateMemberEvidence: ReturnType<typeof createCsharpObjectShapeMemberResolver>["instantiateMemberEvidence"];
    readonly rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact;
  },
) {
  const { resolveNode, resolveType, literalSourceType, retainLiteralMemberEvidence,
    instantiateMemberEvidence, rememberTargetShape } = dependencies;
  const environment = host.typeParameterConstraints;
  function declaredLiteralMembers(
    expected: CsharpObjectShapeFact,
    declared: CsharpObjectShapeFact,
    sourceType: Type,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    if (declared.sourceType !== sourceType) return undefined;
    const targets = [expected.targetType, ...(expected.implements ?? [])]
      .filter((target, index, all) => all.findIndex(candidate => targetTypeRefEquals(candidate, target)) === index);
    const candidates = targets.flatMap(target => {
      const selected = instantiateCsharpObjectShape(declared.declarationTemplate ?? declared, target);
      return selected === undefined || selected.members.length !== expected.members.length ? [] : [selected];
    }).filter(selected => expected.members.every(member => selected.members.filter(candidate =>
      csharpObjectShapeMemberContractKey(candidate) === csharpObjectShapeMemberContractKey(member) &&
      (candidate.readonly === true) === (member.readonly === true)).length === 1));
    if (candidates.length !== 1) return undefined;
    const selected = candidates[0]!;
    return expected.members.map(member => {
      const semantic = selected.members.find(candidate =>
        csharpObjectShapeMemberContractKey(candidate) === csharpObjectShapeMemberContractKey(member))!;
      return { ...member, sourceSubjects: semantic.sourceSubjects, sourceDeclarations: semantic.sourceDeclarations,
        sourceTypes: semantic.sourceTypes,
        sourceMemberEvidence: semantic.sourceMemberEvidence?.filter(evidence => evidence.sourceType === sourceType) };
    });
  }
  function resolveObjectLiteralTargetShape(
    expectedShape: CsharpObjectShapeFact | undefined,
    objectLiteral: Node,
    sourceFile: SourceFile,
    selectedSourceType?: Type,
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
    const implemented = expectedShape.targetType.kind === "target-named" &&
        ((expectedShape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface" ||
          (expectedShape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true)
      ? [expectedShape.targetType]
      : expectedShape.implements;
    const queries = host.semantics(sourceFile);
    const sourceType = selectedSourceType ?? literalSourceType(objectLiteral);
    const actualShape = selectedSourceType !== undefined && expectedShape.sourceType === sourceType ? expectedShape
      : sourceType === undefined ? undefined : resolveType(sourceType, sourceFile, objectLiteral);
    const ownInput = selectedSourceType !== undefined && expectedShape.sourceType === selectedSourceType;
    const context = ownInput ? undefined : selectCsharpLiteralDeclarationContext(objectLiteral, queries, host);
    const declaredType = context?.component.selectedType ?? expectedShape.sourceType;
    const declaredShape = declaredType === undefined || declaredType === expectedShape.sourceType ? undefined
      : resolveType(declaredType, sourceFile, context?.component.authoredTypeNode);
    const declaredMembers = declaredType === undefined ? undefined : declaredType === expectedShape.sourceType
      ? expectedShape.members.map(member => ({ ...member,
          sourceMemberEvidence: member.sourceMemberEvidence?.filter(evidence => evidence.sourceType === declaredType),
        }))
      : declaredShape === undefined ? undefined : declaredLiteralMembers(expectedShape, declaredShape, declaredType);
    const expectedMembers = sourceType === undefined || declaredType === undefined || declaredMembers === undefined ? undefined
      : instantiateMemberEvidence(declaredMembers, sourceType, queries, declaredType);
    if (sourceType === undefined || expectedMembers === undefined) return {
      kind: "rejected", subject: objectLiteral,
      reason: "Object-literal construction requires exact member correspondence with its declared native contract.",
    };
    const additionalMembers = actualShape?.members.filter(actual =>
      !expectedShape.members.some(expected => csharpSourceMemberKeysEqual(expected.sourceKey, actual.sourceKey))) ?? [];
    if (actualShape === undefined) {
      const retained = new Set(expectedMembers.flatMap(member => member.sourceMemberEvidence?.flatMap(evidence =>
        evidence.correspondence.kind === "present" ? [evidence.correspondence.source.property.symbol] : []) ?? []));
      if (queries.types.propertyInfos(sourceType).some(property => !retained.has(property.symbol))) return {
        kind: "rejected", subject: objectLiteral,
        reason: "Object-literal construction requires exact native storage for every actual source member.",
      };
    }
    const members = [...retainLiteralMemberEvidence([...expectedMembers, ...additionalMembers], objectLiteral, queries)];
    const nativeMethodLiteral = members.some(member => member.memberKind === "method" &&
      member.sourceDeclarations?.some(declaration => host.ast.is.IsMethodDeclaration(declaration) &&
        host.ast.body(declaration) !== undefined && host.ast.parent(declaration) === objectLiteral) === true);
    const copiedMethods = host.ast.properties(objectLiteral).some(property => property !== undefined &&
      host.ast.is.IsSpreadAssignment(property)) && expectedShape.members.some(csharpObjectShapeMethodRequiresProtocol);
    const ownsImplementation = expectedShape.methodImplementation?.declaration === objectLiteral;
    if (additionalMembers.length === 0 && accessors.kind === "none" && implemented === expectedShape.implements &&
      (!nativeMethodLiteral || ownsImplementation) && !copiedMethods) {
      for (const member of members) Object.freeze(member);
      return { kind: "resolved", shape: Object.freeze({ ...expectedShape, sourceType, members: Object.freeze(members) }) };
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
    for (const member of shape.members) Object.freeze(member);
    Object.freeze(shape.members);
    return { kind: "resolved", shape: Object.freeze(shape) };
  }

  return resolveObjectLiteralTargetShape;
}
