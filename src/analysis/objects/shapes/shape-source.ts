import type { Type } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpSourceMemberKey } from "../../../target-model/types/model.js";
import { formMemberInstantiationEvidence, type CsharpObjectShapeMemberInstantiationSource,
  type CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import { retainCheckedMemberDeclarationEvidence, type CsharpCollectedObjectShapeMembers } from "./member-source.js";
import type { CsharpProjectDeclarationMemberSource, CsharpProjectDeclarationSource } from "./project-declaration-source.js";
import type { CsharpProviderObjectLiteralSource } from "./provider-construction.js";
import type { CsharpStructShapeSource } from "./struct-source.js";

export interface CsharpObjectShapeSourceMember {
  readonly sourceKey: CsharpSourceMemberKey;
  readonly memberKind: "method" | "property";
  readonly proof: CsharpObjectShapeMemberProofInput;
}

interface CsharpObjectShapeSourceData {
  readonly sourceType: Type;
  readonly members: readonly CsharpObjectShapeSourceMember[];
}

export interface CsharpDeclaredObjectShapeSource extends CsharpObjectShapeSourceData {
  readonly kind: "declaration";
  readonly declaration: CsharpProjectDeclarationSource;
  readonly inherited: readonly (CsharpDeclaredObjectShapeSource | undefined)[];
}

export type CsharpObjectShapeSource = CsharpDeclaredObjectShapeSource | CsharpObjectShapeSourceData & (
  | { readonly kind: "collected"; readonly collection: CsharpCollectedObjectShapeMembers }
  | { readonly kind: "provider"; readonly provider: CsharpProviderObjectLiteralSource }
  | { readonly kind: "struct"; readonly struct: CsharpStructShapeSource }
  | { readonly kind: "instantiated"; readonly previous: CsharpObjectShapeSource;
      readonly instantiation: CsharpObjectShapeMemberInstantiationSource }
);

export function formCollectedObjectShapeSource(collection: CsharpCollectedObjectShapeMembers): CsharpObjectShapeSource {
  return Object.freeze({ kind: "collected", collection, sourceType: collection.ownerType,
    members: Object.freeze(collection.members.map(member => Object.freeze({
      sourceKey: member.sourceKey, proof: member.proofInput,
      memberKind: member.method ? "method" as const : "property" as const,
    }))),
  });
}

function declaredSourceMemberKey(member: CsharpProjectDeclarationMemberSource): CsharpSourceMemberKey {
  let selected = member;
  while (selected.inherited !== undefined) selected = selected.inherited.member;
  return selected.member.sourceKey;
}

export function formDeclaredObjectShapeSource(
  declaration: CsharpProjectDeclarationSource,
  inherited: readonly (CsharpDeclaredObjectShapeSource | undefined)[],
): CsharpDeclaredObjectShapeSource {
  if (inherited.length !== declaration.members.length || declaration.members.some((member, index) =>
    member.inherited === undefined ? inherited[index] !== undefined
      : inherited[index]?.declaration !== member.inherited.source ||
        inherited[index]?.members[member.inherited.index]?.proof !== member.inherited.member)) return failTargetAnalysisInvariant("tsonic-csharp",
        "Declaration source publication requires its exact ordered inherited source occurrences.", declaration.definition.declaration);
  return Object.freeze({ kind: "declaration", declaration, sourceType: declaration.declaredType,
    inherited,
    members: Object.freeze(declaration.members.map(member => Object.freeze({
      sourceKey: declaredSourceMemberKey(member), memberKind: member.member.method ? "method" as const : "property" as const, proof: member,
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
      sourceKey: member.sourceKey!, memberKind: "property" as const, proof: members[index]!,
    }))),
  });
}

export function formStructObjectShapeSource(struct: CsharpStructShapeSource): CsharpObjectShapeSource | undefined {
  const members: CsharpObjectShapeSourceMember[] = [];
  for (const field of struct.fields) {
    if (field.proof === undefined || field.targetName === undefined || field.selectedIndex === undefined) return undefined;
    members.push(Object.freeze({ sourceKey: field.sourceKey, memberKind: "property", proof: field.proof }));
  }
  return Object.freeze({ kind: "struct", struct, sourceType: struct.selectedType, members: Object.freeze(members) });
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
        sourceKey: previous.members[index]!.sourceKey, memberKind: previous.members[index]!.memberKind, proof: member.output,
      })));
  return Object.freeze({ kind: "instantiated", previous, instantiation, sourceType: type, members });
}
