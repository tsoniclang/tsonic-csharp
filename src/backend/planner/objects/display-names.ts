import type {
  CsharpObjectShapeArtifact,
} from "../artifacts/index.js";
import type {
  CsharpObjectShapeNameCandidate,
} from "../../target-ast/normalization/object-shape-names.js";
import {
  csharpRenderShapeForTargetNamedType,
  csharpStructuralObjectShapeIdentity,
  targetTypeRefKey,
} from "../../../target-model/types/index.js";

export function csharpObjectShapeNameCandidates(
  artifacts: readonly CsharpObjectShapeArtifact[],
): readonly CsharpObjectShapeNameCandidate[] {
  return artifacts.flatMap((artifact) => {
    if (
      artifact.materialization !== "synthetic" ||
      artifact.fact.targetType.kind !== "target-named"
    ) {
      return [];
    }
    const render = csharpRenderShapeForTargetNamedType(
      artifact.fact.targetType,
    );
    if (render?.kind !== "named" || render.namespace?.length) {
      return [];
    }
    const identity = csharpStructuralObjectShapeIdentity(
      artifact.fact.targetType,
    );
    if (identity === undefined) {
      return [];
    }
    return [{
      canonicalName: render.name,
      identity,
      preferredStem: preferredObjectShapeStem(artifact),
    }];
  });
}

function preferredObjectShapeStem(
  artifact: CsharpObjectShapeArtifact,
): string {
  const implemented = [...(artifact.fact.implements ?? [])]
    .sort((left, right) =>
      targetTypeRefKey(left).localeCompare(targetTypeRefKey(right), "en"));
  for (const type of implemented) {
    if (type.kind !== "target-named") {
      continue;
    }
    const render = csharpRenderShapeForTargetNamedType(type);
    if (render?.kind !== "named") {
      continue;
    }
    const nested = render.nested;
    return nested === undefined || nested.length === 0
      ? render.name
      : nested[nested.length - 1]!.name;
  }
  return "Object";
}
