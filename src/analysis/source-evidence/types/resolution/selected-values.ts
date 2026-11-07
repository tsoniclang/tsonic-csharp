import type { CsharpTypeResolutionScope } from "./scope.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "./model.js";
import { sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpSourceUnionMembersMatch, getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { resolveCsharpSourceTypeDescriptor } from "./effective-types.js";

import { nextState } from "./state.js";
import { reconcileCsharpSelectedTargetType } from "../../../../policy/types/resolution/selected-type-evidence.js";

import { sourceRefinementOnlyRemovesNullish } from "./source-union-refinement.js";

import { resolveCsharpUnionMemberCarrier } from "./source-evidence.js";

import { csharpSourceStorageContext } from "./source-storage-projection.js";

export function resolveAuthoredAndSelectedSourceType(
  scope: CsharpTypeResolutionScope,
  authoredTypeNode: Node | undefined,
  authoredSourceFile: SourceFile,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host, resolveNodeWithState, resolveTypeWithState } = scope;
  state = csharpSourceStorageContext(host, state, authoredTypeNode);
  const authoredQueries = host.hasSemantics(authoredSourceFile)
    ? host.semantics(authoredSourceFile)
    : undefined;
  const authored = authoredQueries === undefined
    ? undefined
    : resolveNodeWithState(
        authoredTypeNode,
        authoredSourceFile,
        nextState(state),
      );
  if (
    authored === undefined ||
    authoredQueries === undefined ||
    authoredTypeNode === undefined ||
    selectedType === undefined
  ) {
    return authored ?? resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    );
  }
  const selectedQueries = host.semantics(selectedSourceFile);
  const authoredSemanticType = selectedQueries.types.authoredType(
    authoredTypeNode,
  );
  const publication = host.effectiveTypes.get(authoredTypeNode);
  if (publication?.kind === "refused") return undefined;
  if (publication !== undefined && publication.provenance.occurrence !== authoredTypeNode) failTargetAnalysisInvariant(
    "tsonic-csharp", "An authored union refinement requires its identical Source occurrence.", authoredTypeNode);
  const descriptor = publication === undefined ? undefined : sourceTypeDescriptorStructure(publication.type);
  if (descriptor?.kind === "union" || descriptor?.kind === "optional") {
    const component = state.sourceComponent;
    const selectedDescriptor = component?.selectedType === selectedType ? component.descriptor
      : authoredSemanticType !== undefined && selectedQueries.types.isIdentical(authoredSemanticType, selectedType)
        ? publication!.type : undefined;
    if (selectedDescriptor === undefined) failTargetAnalysisInvariant("tsonic-csharp",
      "An authored union refinement requires its published selected Source component.", authoredTypeNode);
    return resolveCsharpUnionMemberCarrier(scope, authored, descriptor, selectedDescriptor, authoredTypeNode, state);
  }
  if (getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(authored) ?? authored, host.typeDefinitions) !== undefined) {
    if (publication === undefined) failTargetAnalysisInvariant("tsonic-csharp",
      "An authored union refinement requires its original published Source descriptor.", authoredTypeNode);
    return authoredSemanticType !== undefined && selectedQueries.types.isIdentical(authoredSemanticType, selectedType)
      ? authored : undefined;
  }
  if (authoredSemanticType === undefined) {
    return resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    );
  }
  const authoredSelection = selectedQueries.types.authoredSelection(
    authoredTypeNode,
    selectedType,
  );
  if (authoredSelection.kind === "authored-members") {
    const onlyAddedAbsence = authoredSelection.selectedNullishTypes.length > 0 &&
      sourceRefinementOnlyRemovesNullish(selectedType, authoredSemanticType, selectedQueries);
    const selectedMembers = authoredSelection.nodes.map((node) =>
      node === authoredTypeNode
        ? onlyAddedAbsence ? authored : reconcileCsharpSelectedTargetType(authored,
            resolveTypeWithState(selectedType, selectedSourceFile, nextState(state)),
            selectedQueries.types.relationship(authoredSemanticType, selectedType),
            selectedQueries.types.isNonPrimitive(selectedType))
        : resolveNodeWithState(
            node,
            authoredSourceFile,
            nextState(state),
          )
    );
    const selectedNullishMembers = authoredSelection.selectedNullishTypes.map(
      (type) =>
        resolveTypeWithState(
          type,
          selectedSourceFile,
          nextState(state),
        ),
    );
    const selectedTargets = [
      ...selectedMembers,
      ...selectedNullishMembers,
    ];
    if (selectedTargets.some(member => member === undefined)) return undefined;
    if (selectedTargets.length === 1) return selectedTargets[0];
    const component = state.sourceComponent;
    const selected = component?.selectedType !== selectedType ? undefined
      : resolveCsharpSourceTypeDescriptor(scope, component.descriptor, state, component.occurrence);
    return selected !== undefined && csharpSourceUnionMembersMatch(selected, selectedTargets as readonly TargetTypeRef[])
      ? selected : undefined;
  }
  if (authoredSelection.kind === "ambiguous") {
    return undefined;
  }
  return reconcileCsharpSelectedTargetType(
    authored,
    resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    ),
    selectedQueries.types.relationship(authoredSemanticType, selectedType),
    selectedQueries.types.isNonPrimitive(selectedType),
  );
}
