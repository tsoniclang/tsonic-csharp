
import { createStructuralObjectShapeTarget } from "./construction.js";


import { selectSourceObjectLiteralAccessors, AsSpreadAssignment } from "@tsonic/target-api/source";

import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import type { Node, SourceFile } from "@tsonic/tsts";

import { csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";

import { selectCsharpObjectMethodImplementation } from "./method-implementations.js";
import { selectCsharpMethodValueEnvironment } from "../../../policy/types/objects/method-environments.js";

import { csharpObjectShapeMethodRequiresProtocol } from "../../../target-model/types/method-values.js";

import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";

import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";
import type { CsharpObjectLiteralTargetShapeResolution } from "../../../target-model/records/objects/object-shapes.js";

import type { createCsharpObjectShapeMemberResolver } from "./member-evidence.js";
import { selectCsharpLiteralDeclarationContext } from "../native-construction-demand.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";

export function createCsharpLiteralShapeResolver(
  host: CsharpObjectShapePolicyHost,
  dependencies: {
    readonly resolveNode: CsharpRecursiveObjectShapePolicy["resolveNode"];
    readonly resolveType: CsharpRecursiveObjectShapePolicy["resolveType"];
    readonly retainLiteralMemberEvidence: ReturnType<typeof createCsharpObjectShapeMemberResolver>["retainLiteralMemberEvidence"];
    readonly instantiateMemberEvidence: ReturnType<typeof createCsharpObjectShapeMemberResolver>["instantiateMemberEvidence"];
    readonly rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact;
  },
): CsharpRecursiveObjectShapePolicy["resolveObjectLiteralTargetShape"] {
  const { resolveNode, resolveType, retainLiteralMemberEvidence, instantiateMemberEvidence, rememberTargetShape } = dependencies;
  const environment = host.typeParameterConstraints;
  function resolveObjectLiteralTargetShape(
    expectedShape: CsharpObjectShapeFact | undefined,
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
    const sourceType = queries.types.expressionType(objectLiteral);
    const context = selectCsharpLiteralDeclarationContext(objectLiteral, queries, host);
    const declared = sourceType !== undefined && expectedShape.sourceType === sourceType ? expectedShape
      : context === undefined ? expectedShape : resolveType(context.component.selectedType, sourceFile,
        context.component.authoredTypeNode);
    const actualShape = expectedShape.targetType.kind === "target-named" &&
      (expectedShape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true
      ? resolveNode(objectLiteral, sourceFile) : undefined;
    const used = new Set<number>();
    const declaredMembers = declared?.sourceType === undefined ? undefined : expectedShape.members.map(member => {
      const selected = resolveCsharpObjectShapeMemberBySelectedSubject(declared,
        [...member.sourceSubjects ?? [], ...member.sourceDeclarations ?? []]);
      if (selected.kind !== "resolved" || selected.member.memberKind !== member.memberKind ||
        !csharpSourceMemberKeysEqual(selected.member.sourceKey, member.sourceKey)) return undefined;
      const index = declared.members.indexOf(selected.member);
      if (used.has(index)) return undefined;
      used.add(index);
      return { ...member,
        sourceMemberEvidence: selected.member.sourceMemberEvidence,
        sourceSubjects: Object.freeze([...new Set([...member.sourceSubjects ?? [], ...selected.member.sourceSubjects ?? []])]),
        sourceDeclarations: selected.member.sourceDeclarations,
        sourceTypes: selected.member.sourceTypes,
      };
    });
    const expectedMembers = sourceType === undefined || declared?.sourceType === undefined || declaredMembers === undefined ||
        declaredMembers.some(member => member === undefined) || used.size !== declared.members.length ? undefined
      : instantiateMemberEvidence(declaredMembers as CsharpObjectShapeFact["members"], sourceType, queries, declared.sourceType);
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
