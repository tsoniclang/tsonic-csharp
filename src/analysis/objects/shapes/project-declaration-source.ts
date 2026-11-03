import type { Node, Type } from "@tsonic/tsts";
import type { CsharpCurrentProjectDeclaration } from "../../source-evidence/model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { csharpSourceTemplateState } from "../../source-evidence/types/resolution/type-bindings.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import { bindCsharpObjectShapeMembersSource, type CsharpObjectShapeMemberSource,
  type CsharpObjectShapeMembersSource, type CsharpCollectedObjectShapeMembers } from "./member-source.js";
import { projectClassIsObjectInitializable } from "./source-evidence.js";
import type { CsharpStructuralTypeCapture, CsharpStructuralTypeSource } from "../../source-evidence/types/resolution/structural-applications.js";

export interface CsharpProjectDeclarationMemberSource extends CsharpObjectShapeMemberProofInput {
  readonly member: CsharpObjectShapeMemberSource;
  readonly inherited: {
    readonly source: CsharpProjectDeclarationSource;
    readonly member: CsharpProjectDeclarationMemberSource;
  } | undefined;
}

export interface CsharpProjectDeclarationSource {
  readonly definition: CsharpCurrentProjectDeclaration;
  readonly declaredType: Type;
  readonly collection: CsharpObjectShapeMembersSource;
  readonly children: CsharpStructuralTypeCapture;
  readonly members: readonly CsharpProjectDeclarationMemberSource[];
  readonly initializable: boolean;
}

export interface CsharpProjectDeclarationShapeSource extends CsharpProjectDeclarationSource {
  readonly source: CsharpProjectDeclarationSource;
  readonly inputState: CsharpTypeResolutionState;
  readonly state: CsharpTypeResolutionState;
  readonly collection: CsharpCollectedObjectShapeMembers;
  readonly application: CsharpStructuralTypeSource;
}

export function createCsharpProjectDeclarationShapeSource(
  host: CsharpObjectShapePolicyHost,
  formMembersSource: (type: Type, queries: CsharpObjectShapeMembersSource["queries"],
    authoredTypeRoot?: Node) => CsharpObjectShapeMembersSource | undefined,
) {
  const active = new Set<Node>();
  const sources = new Map<Node, CsharpProjectDeclarationSource | undefined>();

  function captureProjectDeclarationSource(
    declaration: Node,
  ): CsharpProjectDeclarationSource | undefined {
    if (sources.has(declaration)) return sources.get(declaration);
    const source = formProjectDeclarationSource(declaration);
    sources.set(declaration, source);
    return source;
  }

  function formProjectDeclarationSource(
    declaration: Node,
  ): CsharpProjectDeclarationSource | undefined {
    const definition = host.projectDeclarations.declarationForNode(declaration);
    if (definition?.kind !== "class" && definition?.kind !== "interface" || active.has(declaration)) return undefined;
    active.add(declaration);
    try {
      const queries = host.semantics(definition.sourceFile);
      const declaredType = queries.declarations.declaredType(definition.declaration);
      if (declaredType === undefined) return undefined;
      const collection = formMembersSource(declaredType, queries, host.ast.typeNode(definition.declaration));
      if (collection === undefined) return undefined;
      const children = host.structuralTypeCapture(collection);
      const members: CsharpProjectDeclarationMemberSource[] = [];
      for (const member of collection.members) {
        const input = member.proofInput;
        if (!member.method) {
          members.push(Object.freeze({ ...input, member, inherited: undefined }));
          continue;
        }
        const owners = new Map((input.sourceDeclarations ?? []).flatMap(selected => {
          const owner = host.projectDeclarations.declarationForNode(host.ast.parent(selected));
          return owner === undefined ? [] : [[owner.id, owner] as const];
        }));
        if (owners.size > 1) return undefined;
        const owner = owners.values().next().value;
        if (owner === undefined || owner.id === definition.id) {
          members.push(Object.freeze({ ...input, member, inherited: undefined }));
          continue;
        }
        const inherited = captureProjectDeclarationSource(owner.declaration);
        if (inherited === undefined) return undefined;
        const selected = resolveCsharpObjectShapeMemberBySelectedSubject(inherited,
          [...input.sourceSubjects ?? [], ...input.sourceDeclarations ?? []]);
        if (selected.kind !== "resolved" || !selected.member.member.method) return undefined;
        const original = selected.member;
        members.push(Object.freeze({
          sourceSubjects: Object.freeze([...new Set([...original.sourceSubjects ?? [], ...input.sourceSubjects ?? []])]),
          sourceDeclarations: original.sourceDeclarations,
          sourceTypes: input.sourceTypes === undefined ? original.sourceTypes : input.sourceTypes,
          sourceMemberEvidence: Object.freeze([...new Set([
            ...original.sourceMemberEvidence ?? [], ...input.sourceMemberEvidence ?? [],
          ])]),
          optional: original.optional,
          member,
          inherited: Object.freeze({ source: inherited, member: original }),
        }));
      }
      return Object.freeze({ definition, declaredType, collection, children, members: Object.freeze(members),
        initializable: definition.kind === "class" && projectClassIsObjectInitializable(declaredType, queries, host),
      });
    } finally {
      active.delete(declaration);
    }
  }

  function bindProjectDeclarationSource(
    source: CsharpProjectDeclarationSource,
    inputState: CsharpTypeResolutionState,
  ): CsharpProjectDeclarationShapeSource {
    const state = csharpSourceTemplateState([
      ...source.definition.outerTypeParameters, ...source.definition.typeParameters,
    ], inputState);
    const collection = bindCsharpObjectShapeMembersSource(source.collection, nextState(state));
    return Object.freeze({ ...source, source, inputState, state, collection,
      application: host.bindStructuralTypeCapture(source.children, collection),
    });
  }

  for (const definition of host.projectDeclarations.declarations) {
    if (definition.kind === "class" || definition.kind === "interface") captureProjectDeclarationSource(definition.declaration);
  }
  return Object.freeze({ projectDeclarationSource: (declaration: Node) => sources.get(declaration), bindProjectDeclarationSource });
}
