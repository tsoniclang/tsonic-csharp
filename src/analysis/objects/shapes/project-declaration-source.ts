import type { Node, Type } from "@tsonic/tsts";
import type { CsharpCurrentProjectDeclaration } from "../../source-evidence/model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { csharpSourceTemplateState } from "../../source-evidence/types/resolution/type-bindings.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import type { CsharpCollectedObjectShapeMember, CsharpCollectedObjectShapeMembers } from "./member-source.js";
import { projectClassIsObjectInitializable } from "./source-evidence.js";
import type { CsharpStructuralTypeSource } from "../../source-evidence/types/resolution/structural-applications.js";

export interface CsharpProjectDeclarationMemberSource extends CsharpObjectShapeMemberProofInput {
  readonly member: CsharpCollectedObjectShapeMember;
  readonly inherited: {
    readonly source: CsharpProjectDeclarationShapeSource;
    readonly member: CsharpProjectDeclarationMemberSource;
  } | undefined;
}

export interface CsharpProjectDeclarationShapeSource {
  readonly definition: CsharpCurrentProjectDeclaration;
  readonly state: CsharpTypeResolutionState;
  readonly declaredType: Type;
  readonly collection: CsharpCollectedObjectShapeMembers;
  readonly application: CsharpStructuralTypeSource;
  readonly members: readonly CsharpProjectDeclarationMemberSource[];
  readonly initializable: boolean;
}

export function createCsharpProjectDeclarationShapeSource(
  host: CsharpObjectShapePolicyHost,
  collectMembers: (type: Type, queries: CsharpCollectedObjectShapeMembers["queries"],
    state: CsharpTypeResolutionState, authoredTypeRoot?: Node) => CsharpCollectedObjectShapeMembers | undefined,
) {
  const active = new Set<Node>();

  function formProjectDeclarationSource(
    declaration: Node,
    state: CsharpTypeResolutionState,
  ): CsharpProjectDeclarationShapeSource | undefined {
    const definition = host.projectDeclarations.declarationForNode(declaration);
    if (definition?.kind !== "class" && definition?.kind !== "interface" || active.has(declaration)) return undefined;
    active.add(declaration);
    try {
      state = csharpSourceTemplateState([...definition.outerTypeParameters, ...definition.typeParameters], state);
      const queries = host.semantics(definition.sourceFile);
      const declaredType = queries.declarations.declaredType(definition.declaration);
      if (declaredType === undefined) return undefined;
      const collection = collectMembers(declaredType, queries, nextState(state), host.ast.typeNode(definition.declaration));
      if (collection === undefined) return undefined;
      const application = host.structuralTypeApplication(collection);
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
        const inherited = formProjectDeclarationSource(owner.declaration, nextState(state));
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
      return Object.freeze({ definition, state, declaredType, collection, application, members: Object.freeze(members),
        initializable: definition.kind === "class" && projectClassIsObjectInitializable(declaredType, queries, host),
      });
    } finally {
      active.delete(declaration);
    }
  }

  return { formProjectDeclarationSource };
}
