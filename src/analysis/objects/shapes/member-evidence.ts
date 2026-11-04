import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import { ObjectLiteralProperty_Value, sourcePropertyTypeEvidenceNodes, sourceTransformedTypeFactEvidenceNodes, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberContract, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpSourceMemberDisplayName } from "../../../target-model/types/source-member-keys.js";
import { completeCsharpCallableDeclaration, completeCsharpCallableABI,
  type CsharpCallableABI } from "../../source-evidence/types/resolution/callable-type-parameters.js";
import { csharpMethodValueCoversContract, getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type { CsharpProjectMemberTypeInstantiation } from "../../../target-model/records/types/project-types.js";
import { completeMemberInstantiationEvidence, formMemberInstantiationEvidence, instantiateMemberEvidence,
  matchesMemberSubjects, type CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import { createCsharpObjectShapeMemberSource, formLiteralMemberEvidence, projectLiteralMemberEvidence,
  type CsharpInheritedObjectShapeMemberSource, type CsharpLiteralMemberEvidenceProjection } from "./member-source.js";
import type { CsharpCompletedStructuralMemberChildren, CsharpStructuralMemberApplication,
  CsharpStructuralMemberInheritance, CsharpStructuralTypeApplication,
  CsharpStructuralTypeSource } from "../../source-evidence/types/resolution/structural-applications.js";
import { formCsharpStructuralPropertyApplication } from "../../source-evidence/types/resolution/structural-applications.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { completeCsharpInheritedMemberTypeSource } from "./inherited-member-completion.js";
import { formCsharpObjectShapeHeader, requireCsharpObjectShapeHeader } from "../../../target-model/types/object-shape-header.js";

export interface CsharpStructuralMemberHeader {
  readonly application: CsharpStructuralTypeApplication;
  readonly memberIndex: number;
  readonly member: CsharpStructuralMemberApplication;
  readonly children: CsharpCompletedStructuralMemberChildren;
  readonly callableABI: CsharpCallableABI;
  readonly contract: CsharpObjectShapeMemberContract;
}

export interface CsharpStructuralMemberProofSource {
  readonly header: CsharpStructuralMemberHeader;
  readonly proof: CsharpObjectShapeMemberProofInput;
}

export interface CsharpStructuralMembersHeader {
  readonly source: CsharpStructuralTypeSource;
  readonly application: CsharpStructuralTypeApplication;
  readonly members: readonly CsharpStructuralMemberHeader[];
}

export function csharpStructuralHeaderMembers(
  header: CsharpStructuralMembersHeader,
): readonly CsharpObjectShapeMemberFact[] {
  requireCsharpStructuralMembersHeader(header);
  return Object.freeze(header.members.map(member => Object.freeze({ ...member.contract,
    sourceSubjects: member.member.source.proofInput.sourceSubjects,
    sourceDeclarations: member.member.source.proofInput.sourceDeclarations,
    sourceTypes: member.member.source.proofInput.sourceTypes,
  })));
}

function requireCsharpStructuralMembersHeader(header: CsharpStructuralMembersHeader): void {
  const { application } = header;
  if (application.source !== header.source || header.members.length !== application.members.length ||
    Array.from(application.members).some((member, index) => member === undefined ||
      header.members[index]?.application !== application || header.members[index]?.memberIndex !== index ||
      header.members[index]?.member !== member || header.members[index]?.children.inheritance.application !== application ||
      header.members[index]?.children.inheritance.member !== member ||
      header.members[index]?.callableABI.declared.source !== member.source.callableDeclaration ||
      (header.members[index]!.callableABI.typeParameters.length === 0
        ? header.members[index]!.contract.typeParameters !== undefined
        : header.members[index]!.contract.typeParameters !== header.members[index]!.callableABI.typeParameters))) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Native member completion requires every exact ordered member header.");
  }
}

export function formCsharpStructuralMemberProofSource(
  header: CsharpStructuralMemberHeader,
): CsharpStructuralMemberProofSource {
  return Object.freeze({ header, proof: header.member.source.proofInput });
}

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
  const declarations = authoredTypeNodes.length !== 0 ? [] : [...new Set([property.symbol, ...property.rootSymbols].flatMap(symbol =>
    queries.declarations.symbolDeclarations(symbol)))];
  const declarationValues = Object.freeze(declarations.map(declaration => Object.freeze({ declaration,
    value: numeric && (host.ast.is.IsPropertyAssignment(declaration) || host.ast.is.IsShorthandPropertyAssignment(declaration))
      ? ObjectLiteralProperty_Value(host.ast, declaration) : undefined,
  })));
  return formCsharpStructuralPropertyApplication({ host }, {
    sourceType, queries, state, authoredTypeNodes, numeric, declarationValues,
  });
}

export function retainLiteralMemberEvidence(
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

export function createCsharpObjectShapeMemberResolver(host: CsharpObjectShapePolicyHost) {
  const { formMembersSource, collectMembers } = createCsharpObjectShapeMemberSource(host);

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

  function formMemberHeader(
    application: CsharpStructuralTypeApplication,
    memberIndex: number,
    children: CsharpCompletedStructuralMemberChildren,
  ): CsharpStructuralMemberHeader | undefined {
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
    const callableABI = completeCsharpCallableABI(callableDeclaration,
      methodDeclaration === undefined ? undefined : host.projectTypeCatalog.callableProjections(methodDeclaration));
    if (callableABI === undefined) return undefined;
    const typeParameters = callableABI.typeParameters;
    const optional = property.optional;
    if (bound && (optional || input.nullish || method || getters.length !== 0 || setters.length !== 0)) return undefined;
    const contract: CsharpObjectShapeMemberContract = Object.freeze({
      sourceKey,
      sourceName: csharpSourceMemberDisplayName(sourceKey),
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
    });
    return Object.freeze({ application, memberIndex, member, children, callableABI, contract });
  }

  function completeMemberSource(source: CsharpStructuralMemberProofSource): CsharpObjectShapeMemberFact | undefined {
    const { header, proof } = source;
    const member = header.member;
    if (member.source.proofInput !== proof || header.application.members[header.memberIndex] !== member ||
      header.callableABI.declared.source !== member.source.callableDeclaration ||
      (header.callableABI.typeParameters.length === 0 ? header.contract.typeParameters !== undefined
        : header.contract.typeParameters !== header.callableABI.typeParameters)) {
      return failTargetAnalysisInvariant("tsonic-csharp", "Member completion requires its exact header and retained source proof.");
    }
    const completed: CsharpObjectShapeMemberFact = { ...header.contract,
      sourceSubjects: proof.sourceSubjects,
      ...(proof.sourceDeclarations === undefined ? {} : { sourceDeclarations: proof.sourceDeclarations }),
      sourceTypes: proof.sourceTypes,
    };
    return retainMemberDeclarationEvidence([completed], [proof])?.[0];
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

  function formSourceMembersHeader(
    source: CsharpStructuralTypeSource,
    receiver: TargetTypeRef | undefined,
  ): CsharpStructuralMembersHeader | undefined {
    const application = host.bindStructuralTypeApplication(source, receiver);
    const members: CsharpStructuralMemberHeader[] = [];
    for (const [index] of application.members.entries()) {
      const children = host.typeResolver.resolveStructuralMemberChildren(application, index);
      if (children === undefined) return undefined;
      const member = formMemberHeader(application, index, children);
      if (member === undefined) return undefined;
      members.push(member);
    }
    return Object.freeze({ source, application, members: Object.freeze(members) });
  }

  function completeSourceMembers(
    header: CsharpStructuralMembersHeader,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    const { application } = header;
    requireCsharpStructuralMembersHeader(header);
    if (application.collection.correspondence.kind !== "available") return undefined;
    const members: CsharpObjectShapeMemberFact[] = [];
    for (const member of header.members) {
      const completed = completeMemberSource(formCsharpStructuralMemberProofSource(member));
      if (completed === undefined) return undefined;
      members.push(completed);
    }
    return completeMembers(application, members);
  }

  function completeSourceShape(
    header: CsharpStructuralMembersHeader,
    shape: CsharpObjectShapeFact,
  ): CsharpObjectShapeFact | undefined {
    const proof = completeSourceMembers(header);
    if (proof === undefined) return undefined;
    if (proof.length !== shape.members.length) return failTargetAnalysisInvariant("tsonic-csharp",
      "Shape source completion requires every member of its single physical header.");
    const physical = formCsharpObjectShapeHeader(shape);
    const members = shape.members.map((member, index) => {
      const source = proof[index]!;
      if (member.sourceKey !== source.sourceKey || member.memberKind !== source.memberKind ||
        member.optional !== source.optional || member.sourceSubjects !== source.sourceSubjects ||
        member.sourceDeclarations !== source.sourceDeclarations || member.sourceTypes !== source.sourceTypes) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "Shape source completion requires its exact ordered declared member lineage.");
      }
      return Object.freeze({ ...member, sourceMemberEvidence: source.sourceMemberEvidence });
    });
    const completed = Object.freeze({ ...shape, members: Object.freeze(members) });
    requireCsharpObjectShapeHeader(physical, completed);
    return completed;
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
    const completion = completeCsharpInheritedMemberTypeSource(Object.freeze({ declarations, receiver,
      receiverDefinition: receiver === undefined ? undefined : host.projectTypeCatalog.declarationForTarget(receiver),
      state, method, optional,
    }));
    let step = completion.next();
    while (!step.done) {
      const request = step.value;
      if (request.kind === "declaration") {
        const dependency = request.dependency;
        const signature = dependency.kind !== "method" || dependency.signature === undefined ? undefined
          : host.typeResolver.resolveCallableDeclarationSignature(dependency.signature);
        const type = dependency.kind === "method" ? signature === undefined ? undefined
          : request.source.methodNullish && signature.declaration.typeParameters.length === 0
            ? csharpNullableTargetType(signature.signature) : signature.signature
          : host.typeResolver.resolveNode(dependency.node, dependency.sourceFile, dependency.state);
        step = completion.next(Object.freeze({ kind: "declaration", request, type }));
      } else {
        const result = host.projectTypeQueries.instantiateMemberType(request.source.declaration, request.receiver, request.carrier);
        step = completion.next(Object.freeze({ kind: "instantiation", request, result }));
      }
    }
    return step.value;
  }

  return { formMembersSource, collectMembers, memberInheritance, formMemberHeader, completeMemberSource,
    completeMembers, formSourceMembersHeader, completeSourceMembers, completeSourceShape,
    formMemberInstantiationEvidence, completeMemberInstantiationEvidence, instantiateMemberEvidence,
    formLiteralMemberEvidence: (node: Node, queries: SourceFileSemantics) => formLiteralMemberEvidence(host, node, queries),
    projectLiteralMemberEvidence, retainMemberDeclarationEvidence, resolvePropertyType };
}
