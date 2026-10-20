import type {
  CsharpObjectShapeArtifact,
} from "../../target-model/records/object-shape-demand.js";
import type {
  CsharpObjectShapeDisplayName,
} from "../../target-model/records/object-shape-names.js";
import {
  csharpRenderShapeForTargetNamedType,
  csharpStructuralObjectShapeIdentity,
  targetTypeRefKey,
} from "../../target-model/types/index.js";
import { selectCsharpObjectShapeDisplayNames } from "../names/object-shapes.js";

export interface CsharpObjectShapeNameCandidate {
  readonly canonicalName: string;
  readonly identity: string;
  readonly preferredStem: string;
}

export function analyzeCsharpObjectShapeNames(
  artifacts: readonly CsharpObjectShapeArtifact[],
  reservedNames: ReadonlySet<string>,
): readonly CsharpObjectShapeDisplayName[] {
  const candidates = artifacts.flatMap((artifact) => {
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
  const names = selectCsharpObjectShapeDisplayNames(candidates, reservedNames);
  return Object.freeze(candidates.map(candidate => Object.freeze({ canonicalName: candidate.canonicalName,
    identity: candidate.identity, displayName: names.get(candidate.canonicalName)! })));
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
    if (csharpStructuralObjectShapeIdentity(type) !== undefined) continue;
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
