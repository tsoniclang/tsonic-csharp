import type { Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpSourceMemberKey } from "../../../target-model/types/model.js";
import { formMemberInstantiationEvidence, type CsharpObjectShapeMemberInstantiationSource,
  type CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import { retainCheckedMemberDeclarationEvidence, type CsharpCollectedObjectShapeMembers } from "./member-source.js";
import type { CsharpProjectDeclarationMemberSource, CsharpProjectDeclarationShapeSource } from "./project-declaration-source.js";
import type { CsharpProviderObjectLiteralSource } from "./provider-construction.js";

export interface CsharpObjectShapeSourceMember {
  readonly sourceKey: CsharpSourceMemberKey;
  readonly proof: CsharpObjectShapeMemberProofInput;
}

export type CsharpObjectShapeSource = {
  readonly sourceType: Type;
  readonly members: readonly CsharpObjectShapeSourceMember[];
} & (
  | { readonly kind: "collected"; readonly collection: CsharpCollectedObjectShapeMembers }
  | { readonly kind: "declaration"; readonly declaration: CsharpProjectDeclarationShapeSource }
  | { readonly kind: "provider"; readonly provider: CsharpProviderObjectLiteralSource }
  | { readonly kind: "instantiated"; readonly previous: CsharpObjectShapeSource;
      readonly instantiation: CsharpObjectShapeMemberInstantiationSource }
);

export function formCollectedObjectShapeSource(collection: CsharpCollectedObjectShapeMembers): CsharpObjectShapeSource {
  return Object.freeze({ kind: "collected", collection, sourceType: collection.ownerType,
    members: Object.freeze(collection.members.map(member => Object.freeze({
      sourceKey: member.sourceKey, proof: member.proofInput,
    }))),
  });
}

function declaredSourceMemberKey(member: CsharpProjectDeclarationMemberSource): CsharpSourceMemberKey {
  let selected = member;
  while (selected.inherited !== undefined) selected = selected.inherited.member;
  return selected.member.sourceKey;
}

export function formDeclaredObjectShapeSource(declaration: CsharpProjectDeclarationShapeSource): CsharpObjectShapeSource {
  return Object.freeze({ kind: "declaration", declaration, sourceType: declaration.declaredType,
    members: Object.freeze(declaration.members.map(member => Object.freeze({
      sourceKey: declaredSourceMemberKey(member), proof: member,
    }))),
  });
}

export function formProviderObjectShapeSource(provider: CsharpProviderObjectLiteralSource): CsharpObjectShapeSource | undefined {
  if (!provider.hasConstructionRelation || provider.relations === undefined ||
    provider.members.some(member => member.sourceKey === undefined)) return undefined;
  const inputs = provider.members.map(member => Object.freeze({ sourceSubjects: member.subjects,
    sourceDeclarations: member.declarations.length === 0 ? undefined : member.declarations,
    sourceTypes: member.sourceTypes, optional: member.optional ? true : undefined,
  }));
  const members = retainCheckedMemberDeclarationEvidence(inputs, provider.type,
    provider.queries.types.structuralMembers(provider.type, provider.type, "correspondence"));
  if (members === undefined) return undefined;
  return Object.freeze({ kind: "provider", provider, sourceType: provider.type,
    members: Object.freeze(provider.members.map((member, index) => Object.freeze({
      sourceKey: member.sourceKey!, proof: members[index]!,
    }))),
  });
}

export function formInstantiatedObjectShapeSource(
  previous: CsharpObjectShapeSource,
  type: Type,
  queries: SourceFileSemantics,
): Extract<CsharpObjectShapeSource, { readonly kind: "instantiated" }> | undefined {
  const instantiation = formMemberInstantiationEvidence(Object.freeze({
    members: Object.freeze(previous.members.map(member => member.proof)),
    type, queries, previousSourceType: previous.sourceType,
  }));
  if (instantiation === undefined) return undefined;
  const members = instantiation.kind === "empty" ? Object.freeze([])
    : Object.freeze(instantiation.members.map((member, index) => Object.freeze({
        sourceKey: previous.members[index]!.sourceKey, proof: member.output,
      })));
  return Object.freeze({ kind: "instantiated", previous, instantiation, sourceType: type, members });
}
