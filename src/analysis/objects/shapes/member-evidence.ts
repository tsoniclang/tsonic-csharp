import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import { ObjectLiteralProperty_Value, sourceClassFieldIsTypeOnly, sourceTypeDescriptorStructure, type SourceFileSemantics, type SourceStructuralMember, type SourceStructuralMemberPair, type SourceTypeDescriptor, type SourceTypeDescriptorMember } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectShapeMemberEvidence, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { csharpPropertySourceMemberKey, csharpSourceMemberDisplayName, csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { objectShapeMemberTargetNameForKey } from "../../../policy/identities/source-member-names.js";
import { isCsharpNativeSourceProfileMemberDeclaration } from "./source-evidence.js";
import { resolveObjectShapeSourceMemberKey } from "../../../source/extension/member-keys.js";
import { resolveCsharpCallableTypeParameters } from "../../source-evidence/types/resolution/callable-type-parameters.js";
import { csharpMethodValueCoversContract, getCsharpMethodValue } from "../../../target-model/types/method-values.js";

export function createCsharpObjectShapeMemberResolver(host: CsharpObjectShapePolicyHost) {
  function retainLiteralMemberEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    objectLiteral: Node,
    queries: SourceFileSemantics,
  ): readonly CsharpObjectShapeMemberFact[] {
    const selected = host.ast.properties(objectLiteral).flatMap(element => {
      const evidence = element === undefined ? undefined : queries.operations.objectLiteralElement(element);
      return evidence === undefined || evidence.objectLiteral !== objectLiteral || evidence.element !== element
        ? [] : [evidence];
    });
    return members.map(member => {
      const elements = selected.filter(evidence => member.sourceSubjects?.some(subject =>
        subject === evidence.sourceSelectedSymbol || evidence.sourceSelectedDeclarations.some(declaration => declaration === subject)) === true);
      if (elements.length === 0) return member;
      return { ...member,
        sourceSubjects: Object.freeze([...new Set([
          ...(member.sourceSubjects ?? []),
          ...elements.flatMap(evidence => evidence.sourceElementSymbol === undefined
            ? [evidence.element] : [evidence.element, evidence.sourceElementSymbol]),
        ])]),
        sourceDeclarations: Object.freeze([...new Set([
          ...(member.sourceDeclarations ?? []),
          ...elements.map(evidence => evidence.element),
        ])]),
      };
    });
  }

  function deriveMembers(
    descriptor: SourceTypeDescriptor,
    owner: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    receiver?: TargetTypeRef,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    let structure = sourceTypeDescriptorStructure(descriptor);
    while (structure.kind === "optional" ||
      structure.kind === "callable" && structure.calls.length === 0 && structure.constructs.length === 1) {
      structure = sourceTypeDescriptorStructure(structure.kind === "optional" ? structure.value : structure.constructs[0]!.result);
    }
    if (structure.kind !== "shape" || structure.indexes.length !== 0 || structure.calls.length !== 0 ||
      structure.constructs.length !== 0) return undefined;
    const members: CsharpObjectShapeMemberFact[] = [];
    for (const property of structure.members) {
      const declarations = memberDeclarations(property);
      if (declarations === undefined) return undefined;
      if (declarations.length !== 0 && declarations.every(declaration => sourceClassFieldIsTypeOnly(host.ast, declaration))) continue;
      if (declarations.some(declaration => isCsharpNativeSourceProfileMemberDeclaration(declaration, host.ast))) {
        if (!declarations.every(declaration => isCsharpNativeSourceProfileMemberDeclaration(declaration, host.ast))) return undefined;
        continue;
      }
      const member = deriveMember(property, declarations, owner, queries, state, receiver);
      if (member === undefined || members.some(previous => csharpSourceMemberKeysEqual(previous.sourceKey, member.sourceKey))) return undefined;
      members.push(member);
    }
    return Object.freeze(members);
  }

  function memberDeclarations(property: SourceTypeDescriptorMember): readonly Node[] | undefined {
    if (property.origin.kind !== "declared") return [];
    const declaration = property.origin.declaration;
    const file = host.ast.getSourceFile(declaration);
    if (file === undefined || !host.hasSemantics(file)) return undefined;
    const symbol = host.navigation.declarationSymbol(declaration, file);
    const declarations = symbol === undefined ? [] : host.semantics(file).declarations.symbolDeclarations(symbol);
    return declarations.includes(declaration) ? declarations : [declaration];
  }

  function matchesMemberSubjects(member: CsharpObjectShapeMemberFact, selected: SourceStructuralMember): boolean {
    const subjects = [selected.property.symbol, ...selected.property.rootSymbols, ...selected.declarations];
    return member.sourceSubjects?.some(subject => subjects.some(candidate => candidate === subject)) === true ||
      member.sourceDeclarations?.some(declaration => selected.declarations.includes(declaration)) === true;
  }

  function retainMemberDeclarationEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    ownerType: Type,
    queries: SourceFileSemantics,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    const selected = queries.types.structuralMembers(ownerType, ownerType, "correspondence");
    if (selected.kind !== "available") return undefined;
    const retained = members.map(member => {
      const matching = selected.members.filter(pair => pair.kind === "present" &&
        pair.destination.receiverType === ownerType && pair.source.receiverType === ownerType &&
        matchesMemberSubjects(member, pair.destination));
      if (matching.length !== 1) return undefined;
      return { ...member, sourceMemberEvidence: Object.freeze([Object.freeze({ ownerType, sourceType: ownerType,
        correspondence: matching[0]! })]) };
    });
    return retained.some(member => member === undefined) ? undefined : retained as readonly CsharpObjectShapeMemberFact[];
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

  function revalidateMemberEvidence(
    member: CsharpObjectShapeMemberFact,
    evidence: CsharpObjectShapeMemberEvidence,
    queries: SourceFileSemantics,
  ): SourceStructuralMemberPair | undefined {
    const previous = evidence.correspondence;
    if (previous.destination.receiverType !== evidence.ownerType ||
      previous.kind === "present" && previous.source.receiverType !== evidence.sourceType ||
      !matchesMemberSubjects(member, previous.destination)) return undefined;
    const checked = queries.types.structuralMembers(evidence.sourceType, evidence.ownerType, "correspondence");
    if (checked.kind !== "available") return undefined;
    const matching = checked.members.filter(pair => pair.destination.property.symbol === previous.destination.property.symbol);
    if (matching.length !== 1) return undefined;
    const selected = matching[0]!;
    if (selected.kind !== previous.kind || !sameCheckedMember(selected.destination, previous.destination)) return undefined;
    return selected.kind === "present" && previous.kind === "present" &&
        !sameCheckedMember(selected.source, previous.source) ? undefined : selected;
  }

  function sameMemberSource(left: Type, right: Type, queries: SourceFileSemantics): boolean {
    if (left === right) return true;
    const symbol = queries.declarations.typeSymbol(left);
    return symbol !== undefined && symbol === queries.declarations.typeSymbol(right) &&
      queries.types.isIdentical(left, right);
  }

  function instantiateMemberEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    type: Type,
    queries: SourceFileSemantics,
    previousSourceType: Type | undefined,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    if (previousSourceType === undefined) return undefined;
    if (members.length === 0) return queries.types.structuralMembers(type, previousSourceType, "correspondence").kind === "available"
      ? Object.freeze([]) : undefined;
    const instantiated = members.map(member => {
      const evidence = member.sourceMemberEvidence;
      if (evidence === undefined || evidence.length === 0) return undefined;
      const direct = evidence.filter(selected => sameMemberSource(selected.sourceType, type, queries));
      const candidates = direct.length === 0
        ? evidence.filter(selected => sameMemberSource(selected.sourceType, previousSourceType, queries)) : direct;
      if (candidates.length === 0) return undefined;
      let selected: CsharpObjectShapeMemberEvidence | undefined;
      for (const candidate of candidates) {
        if (revalidateMemberEvidence(member, candidate, queries) === undefined || selected !== undefined &&
          (selected.ownerType !== candidate.ownerType || selected.correspondence.destination.property.symbol !==
            candidate.correspondence.destination.property.symbol)) return undefined;
        selected = candidate;
      }
      if (selected === undefined) return undefined;
      const retained = selected;
      const correspondence = queries.types.structuralMembers(type, retained.ownerType, "correspondence");
      if (correspondence.kind !== "available") return undefined;
      const matching = correspondence.members.filter(pair => pair.destination.receiverType === retained.ownerType &&
        pair.destination.property.symbol === retained.correspondence.destination.property.symbol);
      if (matching.length !== 1) return undefined;
      const pair = matching[0]!;
      const sourceMemberEvidence = Object.freeze([retained.sourceType === type && retained.correspondence === pair
        ? retained : Object.freeze({ ownerType: retained.ownerType, sourceType: type, correspondence: pair })]);
      if (pair.kind !== "present") {
        const retainedAbsence = retained.correspondence.kind === "absent" && sameMemberSource(retained.sourceType, type, queries);
        const declaredContext = retained.correspondence.kind === "present" && retained.sourceType === retained.ownerType &&
          previousSourceType === retained.ownerType;
        return member.optional === true && pair.destination.property.optional && (retainedAbsence || declaredContext)
          ? { ...member, sourceMemberEvidence } : undefined;
      }
      if (pair.source.read === "unavailable") return undefined;
      const property = pair.source.property;
      const declarations = pair.source.declarations;
      return { ...member,
        sourceMemberEvidence,
        sourceSubjects: Object.freeze([...new Set([...member.sourceSubjects ?? [],
          property.symbol, ...property.rootSymbols, ...declarations])]),
        sourceDeclarations: Object.freeze([...new Set(declarations)]),
        sourceTypes: Object.freeze([property.type]),
      };
    });
    return instantiated.some(member => member === undefined) ? undefined
      : instantiated as readonly CsharpObjectShapeMemberFact[];
  }

  function deriveMember(
    property: SourceTypeDescriptorMember,
    declarations: readonly Node[],
    occurrence: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    receiver?: TargetTypeRef,
  ): CsharpObjectShapeMemberFact | undefined {
    const sourcePropertyName = property.name;
    const descriptor = property.type;
    const selection = declarations.length !== 1 ? undefined : host.sourceStorage.memberSubjectFor(declarations[0]!);
    const memberState: CsharpTypeResolutionState = { ...state,
      sourceStorageSubject: selection?.kind === "resolved" ? selection.subject : undefined,
    };
    const sourceKey = property.origin.kind === "mapped" && property.origin.key.kind === "unique-symbol" ? undefined
      : property.origin.kind === "declared" ? resolveObjectShapeSourceMemberKey(declarations, sourcePropertyName, host.ast, host.semanticsFor)
        : csharpPropertySourceMemberKey(sourcePropertyName);
    const targetName = sourceKey === undefined
      ? undefined
      : objectShapeMemberTargetNameForKey(sourceKey);
    if (sourceKey === undefined || targetName === undefined) {
      return undefined;
    }
    const method = declarations.some((declaration) =>
      host.ast.is.IsMethodDeclaration(declaration) ||
      host.ast.is.IsMethodSignatureDeclaration(declaration)
    );
    const getters = declarations.filter(declaration => host.ast.is.IsGetAccessorDeclaration(declaration));
    const setters = declarations.filter(declaration => host.ast.is.IsSetAccessorDeclaration(declaration));
    if (getters.length > 1 || setters.length > 1 ||
      (getters.length === 0 && setters.length > 0)) {
      return undefined;
    }
    let memberType = host.typeResolver.resolveDescriptor(descriptor, occurrence, nextState(memberState));
    if (memberType === undefined) {
      return undefined;
    }
    if (method) memberType = getCsharpMethodValue(memberType)?.contract ?? memberType;
    if (!method && declarations.length === 1) {
      const declaration = declarations[0]!;
      const value = host.ast.is.IsPropertyAssignment(declaration) || host.ast.is.IsShorthandPropertyAssignment(declaration)
        ? ObjectLiteralProperty_Value(host.ast, declaration) : host.ast.is.IsPropertyDeclaration(declaration)
          ? host.ast.as.AsPropertyDeclaration(declaration)?.Initializer : undefined;
      const storage = value === undefined ? undefined : host.typeResolver.resolveNode(value, queries.sourceFile, nextState(state));
      if (storage !== undefined && csharpMethodValueCoversContract(storage, memberType)) memberType = storage;
    }
    let callable = descriptor;
    while (callable.kind === "optional") callable = callable.value;
    const methodDeclaration = method && callable.kind === "callable" && callable.calls.length === 1
      ? callable.calls[0]!.declaration : undefined;
    const typeParameters = resolveCsharpCallableTypeParameters(methodDeclaration, queries.sourceFile, {
      ast: host.ast,
      genericProjections: host.representations.genericProjections,
      types: { resolveNode: (node, sourceFile) => {
        const declared = host.typeResolver.resolveNode(node, sourceFile, nextState(state));
        if (declared === undefined) return undefined;
        if (receiver === undefined) return Object.freeze({ kind: "resolved" as const,
          sourceResult: csharpSourceValueResult(declared)! });
        const selected = host.projectTypes().instantiateMemberType(methodDeclaration, receiver, declared);
        const type = selected.kind === "resolved" ? selected.type
          : selected.kind === "not-project-member" ? declared : undefined;
        return type === undefined ? undefined : Object.freeze({ kind: "resolved" as const,
          sourceResult: csharpSourceValueResult(type)! });
      } },
    });
    if (typeParameters === undefined) return undefined;
    const sourceDeclarations = [...new Set([...declarations, ...(methodDeclaration === undefined ? [] : [methodDeclaration])])];
    const optional = property.optional;
    const bound = host.memoryBindings.hasBoundField(declarations);
    if (bound && (optional || descriptorIncludesAbsence(descriptor) || method || getters.length !== 0 || setters.length !== 0)) return undefined;
    return {
      sourceKey,
      sourceName: csharpSourceMemberDisplayName(sourceKey),
      origin: property.origin,
      sourceSubjects: declarations,
      ...(sourceDeclarations.length === 0
        ? {}
        : { sourceDeclarations: Object.freeze(sourceDeclarations) }),
      targetName,
      memberKind: method ? "method" : "property",
      type: memberType,
      ...(typeParameters.length === 0 ? {} : {
        typeParameters: Object.freeze(typeParameters as NonNullable<typeof typeParameters[number]>[]),
      }),
      ...(optional ? { optional: true } : {}),
      ...(property.readonly ? { readonly: true } : {}),
      ...(bound ? { bound: true as const } : {}),
      ...(getters.length === 0
        ? {}
        : {
            accessor: {
              getter: true as const,
              setter: setters.length === 1,
            },
          }),
    };
  }

  function descriptorIncludesAbsence(descriptor: SourceTypeDescriptor): boolean {
    const structure = sourceTypeDescriptorStructure(descriptor);
    return structure.kind === "optional" || structure.kind === "intrinsic" && structure.intrinsic === "absence" ||
      structure.kind === "union" && structure.types.some(descriptorIncludesAbsence);
  }

  function resolvePropertyType(
    property: TypePropertyInfo,
    descriptor: SourceTypeDescriptor,
    occurrence: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const declarations = [...new Set([property.symbol, ...property.rootSymbols].flatMap(symbol =>
      queries.declarations.symbolDeclarations(symbol)))];
    while (descriptor.kind === "optional") descriptor = descriptor.value;
    const structure = sourceTypeDescriptorStructure(descriptor);
    const members = structure.kind === "shape" ? structure.members : undefined;
    const selected = members?.filter(member => member.origin.kind === "declared" && declarations.includes(member.origin.declaration));
    return selected?.length !== 1 ? undefined : host.typeResolver.resolveDescriptor(selected[0]!.type, occurrence, nextState(state));
  }

  return { deriveMembers, instantiateMemberEvidence, retainMemberDeclarationEvidence, resolvePropertyType, retainLiteralMemberEvidence };
}
import { csharpSourceValueResult } from "../../source-evidence/types/resolution/call-results.js";
