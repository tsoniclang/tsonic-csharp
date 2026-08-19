import type { CsharpArtifactFacet } from "../contracts.js";
import type { CsharpArtifactGraphScope } from "./engine.js";
import type { TargetArtifactDependency } from "@tsonic/target-api/artifacts";

export function captureDependencies<Value>(
  { dependencyCapture }: CsharpArtifactGraphScope,
  owner: string,
  build: () => Value,
): {
  readonly value: Value;
  readonly dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[];
} {
  if (dependencyCapture.active !== undefined) {
    throw new Error(
      `C# target artifact '${owner}' attempted nested dependency capture.`,
    );
  }
  dependencyCapture.active = new Map();
  try {
    const value = build();
    return {
      value,
      dependencies: Object.freeze(
        [...dependencyCapture.active.values()].sort((left, right) =>
          left.owner.localeCompare(right.owner) ||
          left.facet.localeCompare(right.facet)
        ),
      ),
    };
  } finally {
    dependencyCapture.active = undefined;
  }
}


export function dependOn(
  { dependencyCapture }: CsharpArtifactGraphScope,
  owner: string,
  facet: CsharpArtifactFacet,
): void {
  if (dependencyCapture.active === undefined) {
    return;
  }
  const key = `${owner.length}:${owner}${facet.length}:${facet}`;
  dependencyCapture.active.set(key, Object.freeze({ owner, facet }));
}
