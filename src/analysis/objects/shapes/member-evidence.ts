import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import { ObjectLiteralProperty_Value, sourcePropertyTypeEvidenceNodes, sourceTransformedTypeFactEvidenceNodes, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpSourceMemberDisplayName } from "../../../target-model/types/source-member-keys.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { completeCsharpCallableDeclaration, completeCsharpCallableTypeParameters } from "../../source-evidence/types/resolution/callable-type-parameters.js";
import { csharpMethodValueCoversContract, getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type { CsharpProjectMemberTypeInstantiation } from "../../../target-model/records/types/project-types.js";
import { completeMemberInstantiationEvidence, formMemberInstantiationEvidence, instantiateMemberEvidence,
  matchesMemberSubjects, type CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import { createCsharpObjectShapeMemberSource, formLiteralMemberEvidence, projectLiteralMemberEvidence,
  type CsharpInheritedObjectShapeMemberSource, type CsharpLiteralMemberEvidenceProjection } from "./member-source.js";
import type { CsharpCompletedStructuralMemberChildren, CsharpStructuralMemberApplication,
  CsharpStructuralMemberInheritance, CsharpStructuralTypeApplication } from "../../source-evidence/types/resolution/structural-applications.js";
import { formCsharpStructuralPropertyApplication } from "../../source-evidence/types/resolution/structural-applications.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function formCsharpObjectShapePropertySource(
  host: CsharpTypePolicyBaseHost,
  property: TypePropertyInfo,
  sourceType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  authoredTypeRoot?: Node,
): import("../../source-evidence/types/resolution/structural-applications.js").CsharpStructuralPropertyApplication {
  const authoredTypeNodes = [
    ...sourcePropertyTypeEvidenceNodes(host.ast, queries, property),
    ...(authoredTypeRoot === undefined ? []
      : sourceTransformedTypeFactEvidenceNodes(host.ast, queries, authoredTypeRoot, sourceType)),
  ];
  const numeric = authoredTypeNodes.length === 0 &&
    (queries.types.isNumberLike(sourceType) || queries.types.isBigIntLike(sourceType));
  const declarations = !numeric ? [] : [...new Set([property.symbol, ...property.rootSymbols].flatMap(symbol =>
    queries.declarations.symbolDeclarations(symbol)))];
  const declarationValues = Object.freeze(declarations.map(declaration => Object.freeze({ declaration,
    value: host.ast.is.IsPropertyAssignment(declaration) || host.ast.is.IsShorthandPropertyAssignment(declaration)
      ? ObjectLiteralProperty_Value(host.ast, declaration) : undefined,
  })));
  return formCsharpStructuralPropertyApplication({ host }, {
    sourceType, queries, state, authoredTypeNodes, numeric, declarationValues,
  });
}

export function createCsharpObjectShapeMemberResolver(host: CsharpObjectShapePolicyHost) {
  const { collectMembers } = createCsharpObjectShapeMemberSource(host);

  function retainLiteralMemberEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    source: CsharpLiteralMemberEvidenceProjection<CsharpObjectShapeMemberProofInput>,
  ): readonly CsharpObjectShapeMemberFact[] {
    if (members.length !== source.members.length) return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal member completion requires every original selected source row.");
    return members.map((member, index) => {
      const { input, output } = source.members[index]!;
      if (member.sourceSubjects !== input.sourceSubjects || member.sourceDeclarations !== input.sourceDeclarations ||
        member.sourceTypes !== input.sourceTypes || member.sourceMemberEvidence !== input.sourceMemberEvidence ||
        member.optional !== input.optional) {
        return failTargetAnalysisInvariant("tsonic-csharp", "Literal member completion requires its exact selected source lineage.");
      }
      return output === input ? member : { ...member,
        sourceSubjects: output.sourceSubjects, sourceDeclarations: output.sourceDeclarations };
    });
  }

  function retainMemberDeclarationEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    inputs: readonly CsharpObjectShapeMemberProofInput[],
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    if (members.length !== inputs.length) return failTargetAnalysisInvariant("tsonic-csharp",
      "Declaration member completion requires every original source proof input.");
    const retained = members.map((member, index) => {
      const input = inputs[index]!;
      if (member.sourceSubjects !== input.sourceSubjects || member.sourceDeclarations !== input.sourceDeclarations ||
        member.sourceTypes !== input.sourceTypes || member.optional !== input.optional) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "Declaration member completion requires its exact source subjects and optional state.");
      }
      const evidence = input.sourceMemberEvidence;
      if (evidence?.length !== 1) return undefined;
      const selected = evidence[0]!;
      const pair = selected.correspondence;
      if (selected.sourceType !== selected.ownerType || pair.kind !== "present" ||
        pair.destination.receiverType !== selected.ownerType || pair.source.receiverType !== selected.ownerType ||
        !matchesMemberSubjects(input, pair.destination)) return undefined;
      return { ...member, sourceMemberEvidence: evidence };
    });
    return retained.some(member => member === undefined) ? undefined : retained as readonly CsharpObjectShapeMemberFact[];
  }

  function memberApplication(
    application: CsharpStructuralTypeApplication,
    memberIndex: number,
  ): CsharpStructuralMemberApplication {
    const member = application.members[memberIndex];
    if (application.members.length !== application.collection.members.length || member === undefined ||
      member.source !== application.collection.members[memberIndex]) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "Structural member completion requires its exact collected application occurrence.");
    }
    return member;
  }

  function memberInheritance(
    application: CsharpStructuralTypeApplication,
    memberIndex: number,
  ): CsharpStructuralMemberInheritance {
    const member = memberApplication(application, memberIndex);
    const source = member.source;
    return Object.freeze({ application, member,
      selection: resolveInheritedMemberType(source.inheritedDeclarations, application.receiver,
        source.state, source.method, source.property.optional),
    });
  }

  function completeMember(
    application: CsharpStructuralTypeApplication,
    memberIndex: number,
    children: CsharpCompletedStructuralMemberChildren,
  ): CsharpObjectShapeMemberFact | undefined {
    const member = memberApplication(application, memberIndex);
    const input = member.source;
    const { property, declarations, sourceKey, targetName, method, getters, setters, methodDeclaration, bound } = input;
    const node = methodDeclaration ?? declarations[0];
    if (children.inheritance.application !== application || children.inheritance.member !== member ||
      children.inheritance.selection.kind === "unresolved" || children.baseType === undefined ||
      children.inheritance.selection.kind === "resolved" && children.baseType !== children.inheritance.selection.type) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "Structural children require their exact successful inheritance and native base.", node);
    }
    if (member.value === undefined ? children.value !== undefined : children.value?.request !== member.value) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "Structural value completion requires its exact retained request.", node);
    }
    if (children.constraints.length !== member.constraints.length ||
      children.constraints.some((constraint, index) => constraint.request !== member.constraints[index])) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "Structural constraints require every ordered retained request.", node);
    }
    let memberType = children.baseType;
    if (method) memberType = getCsharpMethodValue(memberType)?.contract ?? memberType;
    if (!method && declarations.length === 1) {
      const storage = children.value?.type;
      if (storage !== undefined && csharpMethodValueCoversContract(storage, memberType)) memberType = storage;
    }
    const callableDeclaration = completeCsharpCallableDeclaration(input.callableDeclaration,
      children.constraints.map(constraint => Object.freeze({ source: constraint.request.source, resolution: constraint.resolution })));
    if (callableDeclaration === undefined) return undefined;
    const typeParameters = completeCsharpCallableTypeParameters(callableDeclaration,
      methodDeclaration === undefined ? [] : host.representations.genericProjections(methodDeclaration));
    if (typeParameters === undefined) return undefined;
    const sourceDeclarations = input.proofInput.sourceDeclarations;
    const optional = property.optional;
    if (bound && (optional || input.nullish || method || getters.length !== 0 || setters.length !== 0)) return undefined;
    const completed: CsharpObjectShapeMemberFact = {
      sourceKey,
      sourceName: csharpSourceMemberDisplayName(sourceKey),
      sourceSubjects: input.proofInput.sourceSubjects,
      ...(sourceDeclarations === undefined ? {} : { sourceDeclarations }),
      sourceTypes: input.proofInput.sourceTypes,
      targetName,
      memberKind: method ? "method" : "property",
      type: optional ? csharpNullableTargetType(memberType) : memberType,
      ...(typeParameters.length === 0 ? {} : {
        typeParameters: Object.freeze(typeParameters as NonNullable<typeof typeParameters[number]>[]),
      }),
      ...(optional ? { optional: true } : {}),
      ...(property.readonly ? { readonly: true } : {}),
      ...(bound ? { bound: true as const } : {}),
      ...(getters.length === 0 ? {} : { accessor: { getter: true as const, setter: setters.length === 1 } }),
    };
    return retainMemberDeclarationEvidence([completed], [input.proofInput])?.[0];
  }

  function completeMembers(
    application: CsharpStructuralTypeApplication,
    members: readonly CsharpObjectShapeMemberFact[],
  ): readonly CsharpObjectShapeMemberFact[] {
    if (application.members.length !== application.collection.members.length || members.length !== application.members.length) {
      return failTargetAnalysisInvariant("tsonic-csharp", "Structural completion requires every original member in order.");
    }
    for (const [index, member] of members.entries()) {
      const source = memberApplication(application, index).source;
      const evidence = member.sourceMemberEvidence;
      if (evidence?.length !== 1 || evidence[0]!.ownerType !== application.collection.ownerType ||
        evidence[0]!.sourceType !== application.collection.ownerType || evidence[0]!.correspondence !== source.correspondence ||
        member.sourceTypes?.length !== 1 || member.sourceTypes[0] !== source.propertyType) {
        return failTargetAnalysisInvariant("tsonic-csharp", "Structural completion requires the same ordered native member proof.",
          source.methodDeclaration ?? source.declarations[0]);
      }
    }
    return Object.freeze([...members]);
  }

  function resolvePropertyType(
    property: TypePropertyInfo,
    sourceType: Type,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node,
  ): TargetTypeRef | undefined {
    return host.typeResolver.resolveStructuralPropertyType(
      formCsharpObjectShapePropertySource(host, property, sourceType, queries, state, authoredTypeRoot));
  }

  function resolveInheritedMemberType(
    declarations: readonly CsharpInheritedObjectShapeMemberSource[],
    receiver: TargetTypeRef | undefined,
    state: CsharpTypeResolutionState,
    method: boolean,
    optional: boolean,
  ): CsharpProjectMemberTypeInstantiation {
    if (receiver === undefined) return { kind: "not-project-member" };
    const receiverDefinition = host.projectTypeCatalog.definitionForTarget(receiver);
    if (receiverDefinition === undefined) return { kind: "not-project-member" };
    const inherited = declarations.filter(source => source.owner.id !== receiverDefinition.id);
    if (inherited.length === 0) return { kind: "not-project-member" };
    const selected: TargetTypeRef[] = [];
    for (const { declaration, owner, typeNode, methodType } of inherited) {
      const declared = method
        ? host.typeResolver.resolveType(methodType, owner.sourceFile, nextState(state))
        : host.typeResolver.resolveNode(typeNode ?? declaration, owner.sourceFile, nextState(state));
      if (declared === undefined) return { kind: "unresolved",
        reason: `Inherited project member of '${owner.sourceName}' has no exact authored native carrier.` };
      const carrier = optional ? csharpNullableTargetType(declared) : declared;
      const result = host.projectTypes().instantiateMemberType(declaration, receiver, carrier);
      if (result.kind !== "resolved") return result.kind === "unresolved" ? result : { kind: "unresolved",
        reason: `Inherited project member of '${owner.sourceName}' lost its canonical project declaration.` };
      selected.push(result.type);
    }
    const first = selected[0]!;
    return selected.every(type => targetTypeRefEquals(first, type)) ? { kind: "resolved", type: first }
      : { kind: "unresolved", reason: "Inherited project member declarations have incompatible native carrier instantiations." };
  }

  return { collectMembers, memberInheritance, completeMember, completeMembers,
    formMemberInstantiationEvidence, completeMemberInstantiationEvidence, instantiateMemberEvidence,
    formLiteralMemberEvidence: (node: Node, queries: SourceFileSemantics) => formLiteralMemberEvidence(host, node, queries),
    projectLiteralMemberEvidence, retainMemberDeclarationEvidence, resolvePropertyType, retainLiteralMemberEvidence };
}
