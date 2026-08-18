import type { CsharpArtifactGraphScope } from "./engine.js";
import type { CsharpArtifactRequestResult } from "./model.js";
import type { CsharpGeneratedHelper } from "../generated-helpers.js";
export function requireGeneratedHelper(
  { dependOn, helpers }: CsharpArtifactGraphScope,
  helper: CsharpGeneratedHelper,
): CsharpArtifactRequestResult {
  const result = helpers.require(helper);
  if (result.kind === "accepted") {
    dependOn(
      `generated-helper:${helper}`,
      "generated-helper-surface",
    );
  }
  return result;
}
