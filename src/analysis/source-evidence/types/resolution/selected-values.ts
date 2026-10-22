import type { CsharpTypeResolutionScope } from "./scope.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "./model.js";

import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../../../../target-model/types/carriers/runtime-carriers.js";

import { nextState } from "./state.js";
import { reconcileCsharpSelectedTargetType } from "../../../../policy/types/resolution/selected-type-evidence.js";

import { selectCsharpAuthoredUnionRefinement, sourceRefinementOnlyRemovesNullish } from "./source-union-refinement.js";

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
  if (authoredSemanticType === undefined) {
    return resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    );
  }
  const unionRefinement = selectCsharpAuthoredUnionRefinement(
    authored, authoredSemanticType, selectedType, selectedQueries,
    type => resolveCsharpUnionMemberCarrier(scope, authored, type, selectedQueries, state),
    host.structuralTypes.resolveTarget,
    host.typeDefinitions,
  );
  if (unionRefinement.kind !== "not-applicable") {
    return unionRefinement.kind === "resolved" ? unionRefinement.type : undefined;
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
            selectedQueries.types.relationship(authoredSemanticType, selectedType))
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
    return selectedTargets.some((member) => member === undefined)
      ? undefined
      : combineCsharpTargetUnionMembers(
          selectedTargets as readonly TargetTypeRef[],
        );
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
  );
}
