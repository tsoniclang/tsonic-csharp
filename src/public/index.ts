import { createCsharpTargetPack } from "../descriptor/csharp-target-pack.js";
import { csharpTargetId } from "../source/identities.js";

export { createCsharpTargetPack } from "../descriptor/csharp-target-pack.js";
export { csharpTargetId } from "../source/identities.js";
export type {
  CsharpLanguageDialect,
  CsharpMemorySafetyRules,
  CsharpOutputType,
  CsharpProjectReference,
} from "../options/csharp-target-options.js";

export function createTsonicPlugin() {
  return {
    kind: "target" as const,
    id: "@tsonic/target-csharp",
    targetId: csharpTargetId,
    createTargetPack: createCsharpTargetPack,
  };
}
