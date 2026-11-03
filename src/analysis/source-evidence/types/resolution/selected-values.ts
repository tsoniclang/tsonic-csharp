import type { CsharpTypeResolutionScope } from "./scope.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics, SourceTypeRelationship } from "@tsonic/target-api/source";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { nextState } from "./state.js";
import { reconcileCsharpSelectedTargetType } from "../../../../policy/types/resolution/selected-type-evidence.js";
import { completeCsharpAuthoredUnionRefinement, formCsharpAuthoredUnionRefinement,
  sourceRefinementOnlyRemovesNullish, type CsharpAuthoredUnionRefinementEvidence } from "./source-union-refinement.js";
import { resolveCsharpUnionMemberCarrier } from "./source-evidence.js";
import { bindCsharpSourceStorageContext, formCsharpSourceStorageContext,
  type CsharpSourceStorageContextSource } from "./source-storage-projection.js";

export type CsharpSourceTypeDependency = {
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "node"; readonly node: Node }
  | { readonly kind: "type"; readonly type: Type | undefined }
);

export interface CsharpAuthoredTypeSelectionSource {
  readonly authoredTypeNode: Node | undefined;
  readonly authoredSourceFile: SourceFile;
  readonly selectedType: Type | undefined;
  readonly selectedSourceFile: SourceFile;
  readonly storage: CsharpSourceStorageContextSource;
  readonly authoredAvailable: boolean;
  readonly selection: {
    readonly queries: SourceFileSemantics;
    readonly refinement: CsharpAuthoredUnionRefinementEvidence;
    readonly authored: ReturnType<SourceFileSemantics["types"]["authoredSelection"]>;
    readonly relationship: SourceTypeRelationship;
    readonly selectedNonPrimitive: boolean;
    readonly onlyAddedAbsence: boolean;
  } | undefined;
}

export interface CsharpAuthoredTypeSelectionEvidence extends CsharpAuthoredTypeSelectionSource {
  readonly source: CsharpAuthoredTypeSelectionSource;
  readonly state: CsharpTypeResolutionState;
  readonly dependencies: {
    readonly authored: CsharpSourceTypeDependency | undefined;
    readonly selected: CsharpSourceTypeDependency;
    readonly members: readonly CsharpSourceTypeDependency[];
    readonly nullishMembers: readonly CsharpSourceTypeDependency[];
  };
}

export function formAuthoredAndSelectedSourceType(
  scope: { readonly host: CsharpTypePolicyBaseHost },
  authoredTypeNode: Node | undefined,
  authoredSourceFile: SourceFile,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): CsharpAuthoredTypeSelectionEvidence {
  return bindCsharpAuthoredTypeSelectionSource(formCsharpAuthoredTypeSelectionSource(scope,
    authoredTypeNode, authoredSourceFile, selectedType, selectedSourceFile, state.sourceStorageSubject), state);
}

export function formCsharpAuthoredTypeSelectionSource(
  { host }: { readonly host: CsharpTypePolicyBaseHost },
  authoredTypeNode: Node | undefined,
  authoredSourceFile: SourceFile,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  storageSubject: CsharpTypeResolutionState["sourceStorageSubject"],
): CsharpAuthoredTypeSelectionSource {
  const storage = formCsharpSourceStorageContext(host, storageSubject, authoredTypeNode);
  const authoredAvailable = host.hasSemantics(authoredSourceFile);
  let selection: CsharpAuthoredTypeSelectionSource["selection"];
  if (authoredAvailable && authoredTypeNode !== undefined && selectedType !== undefined) {
    const queries = host.semantics(selectedSourceFile);
    const authoredSemanticType = queries.types.authoredType(authoredTypeNode);
    if (authoredSemanticType !== undefined) {
      const selectedAuthored = queries.types.authoredSelection(authoredTypeNode, selectedType);
      selection = Object.freeze({
        queries,
        refinement: formCsharpAuthoredUnionRefinement(authoredSemanticType, selectedType, queries),
        authored: selectedAuthored.kind === "authored-members" ? Object.freeze({ ...selectedAuthored,
          nodes: Object.freeze([...selectedAuthored.nodes]),
          selectedNullishTypes: Object.freeze([...selectedAuthored.selectedNullishTypes]),
        }) : Object.freeze({ ...selectedAuthored }),
        relationship: queries.types.relationship(authoredSemanticType, selectedType),
        selectedNonPrimitive: queries.types.isNonPrimitive(selectedType),
        onlyAddedAbsence: selectedAuthored.kind === "authored-members" &&
          selectedAuthored.selectedNullishTypes.length > 0 &&
          sourceRefinementOnlyRemovesNullish(selectedType, authoredSemanticType, queries),
      });
    }
  }
  return Object.freeze({ authoredTypeNode, authoredSourceFile, selectedType, selectedSourceFile,
    storage, authoredAvailable, selection });
}

export function bindCsharpAuthoredTypeSelectionSource(
  source: CsharpAuthoredTypeSelectionSource,
  state: CsharpTypeResolutionState,
): CsharpAuthoredTypeSelectionEvidence {
  const { authoredTypeNode, authoredSourceFile, selectedType, selectedSourceFile, selection } = source;
  const retainedState = Object.freeze(bindCsharpSourceStorageContext(source.storage, state));
  const childState = Object.freeze(nextState(retainedState));
  const authored: CsharpSourceTypeDependency | undefined = !source.authoredAvailable || authoredTypeNode === undefined
    ? undefined : Object.freeze({ kind: "node", node: authoredTypeNode, sourceFile: authoredSourceFile, state: childState });
  const selected: CsharpSourceTypeDependency = Object.freeze({
    kind: "type", type: selectedType, sourceFile: selectedSourceFile, state: childState,
  });
  const members = selection?.authored.kind !== "authored-members" ? [] : selection.authored.nodes.map(node =>
    node === authoredTypeNode && authored !== undefined ? authored
      : Object.freeze({ kind: "node" as const, node, sourceFile: authoredSourceFile, state: childState }));
  const nullishMembers = selection?.authored.kind !== "authored-members" ? []
    : selection.authored.selectedNullishTypes.map(type => Object.freeze({
      kind: "type" as const, type, sourceFile: selectedSourceFile, state: childState,
    }));
  return Object.freeze({ ...source, source,
    state: retainedState, selection, dependencies: Object.freeze({
      authored, selected, members: Object.freeze(members), nullishMembers: Object.freeze(nullishMembers),
    }),
  });
}

export function resolveSourceTypeDependency(
  scope: Pick<CsharpTypeResolutionScope, "resolveNodeWithState" | "resolveTypeWithState">,
  dependency: CsharpSourceTypeDependency,
): TargetTypeRef | undefined {
  return dependency.kind === "node"
    ? scope.resolveNodeWithState(dependency.node, dependency.sourceFile, dependency.state)
    : scope.resolveTypeWithState(dependency.type, dependency.sourceFile, dependency.state);
}

export function resolveAuthoredAndSelectedSourceType(
  scope: CsharpTypeResolutionScope,
  authoredTypeNode: Node | undefined,
  authoredSourceFile: SourceFile,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveFormedAuthoredAndSelectedSourceType(scope, formAuthoredAndSelectedSourceType(
    scope, authoredTypeNode, authoredSourceFile, selectedType, selectedSourceFile, state));
}

export function resolveFormedAuthoredAndSelectedSourceType(
  scope: CsharpTypeResolutionScope,
  evidence: CsharpAuthoredTypeSelectionEvidence,
): TargetTypeRef | undefined {
  const authored = evidence.dependencies.authored === undefined ? undefined
    : resolveSourceTypeDependency(scope, evidence.dependencies.authored);
  const resolveSelected = () => resolveSourceTypeDependency(scope, evidence.dependencies.selected);
  if (authored === undefined || evidence.authoredTypeNode === undefined || evidence.selectedType === undefined) {
    return authored ?? resolveSelected();
  }
  const selection = evidence.selection;
  if (selection === undefined) return resolveSelected();
  const refinement = completeCsharpAuthoredUnionRefinement(authored, selection.refinement,
    type => resolveCsharpUnionMemberCarrier(scope, authored, type, selection.queries, evidence.state),
    scope.host.structuralTypes.resolveTarget, scope.host.typeDefinitions);
  if (refinement.kind !== "not-applicable") return refinement.kind === "resolved" ? refinement.type : undefined;
  if (selection.authored.kind === "authored-members") {
    const selectedMembers = selection.authored.nodes.map((node, index) => node === evidence.authoredTypeNode
      ? selection.onlyAddedAbsence ? authored : reconcileCsharpSelectedTargetType(authored,
        resolveSelected(), selection.relationship, selection.selectedNonPrimitive)
      : resolveSourceTypeDependency(scope, evidence.dependencies.members[index]!));
    const selectedNullishMembers = evidence.dependencies.nullishMembers.map(dependency =>
      resolveSourceTypeDependency(scope, dependency));
    const targets = [...selectedMembers, ...selectedNullishMembers];
    return targets.some(type => type === undefined) ? undefined
      : combineCsharpTargetUnionMembers(targets as readonly TargetTypeRef[]);
  }
  if (selection.authored.kind === "ambiguous") return undefined;
  return reconcileCsharpSelectedTargetType(authored, resolveSelected(),
    selection.relationship, selection.selectedNonPrimitive);
}
