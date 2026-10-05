import type { CsharpArtifactFacet } from "../contracts.js";
import type { CsharpArtifactGraphScope } from "./engine.js";
import type { TargetArtifactDependency } from "@tsonic/target-api/artifacts";

export function captureDependencies<Value>(
  scope: CsharpArtifactGraphScope,
  owner: string,
  dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[],
  build: () => Value,
): {
  readonly value: Value;
  readonly dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[];
  readonly stable: boolean;
} {
  const { dependencyCapture, contracts } = scope;
  if (dependencyCapture.active !== undefined) {
    throw new Error(
      `C# target artifact '${owner}' attempted nested dependency capture.`,
    );
  }
  dependencyCapture.active = new Map();
  try {
    for (const dependency of dependencies) dependOn(scope, dependency.owner, dependency.facet);
    const value = build();
    return {
      value,
      dependencies: Object.freeze(
        [...dependencyCapture.active.values()].map(read => read.dependency).sort((left, right) =>
          left.owner.localeCompare(right.owner) ||
          left.facet.localeCompare(right.facet)
        ),
      ),
      stable: [...dependencyCapture.active.values()].every(read =>
        contracts.facetRevision(read.dependency.owner, read.dependency.facet) === read.revision),
    };
  } finally {
    dependencyCapture.active = undefined;
  }
}


export function dependOn(
  { dependencyCapture, contracts }: CsharpArtifactGraphScope,
  owner: string,
  facet: CsharpArtifactFacet,
): void {
  if (dependencyCapture.active === undefined) {
    return;
  }
  const key = `${owner.length}:${owner}${facet.length}:${facet}`;
  if (!dependencyCapture.active.has(key)) dependencyCapture.active.set(key, Object.freeze({
    dependency: Object.freeze({ owner, facet }), revision: contracts.facetRevision(owner, facet),
  }));
}
