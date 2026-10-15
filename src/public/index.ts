import { createCsharpTargetPack } from "../descriptor/csharp-target-pack.js";
import { createCsharpStarterProject } from "../descriptor/csharp-starter-project.js";
import { csharpTargetId } from "../target-model/identities/source.js";

export { createCsharpTargetPack } from "../descriptor/csharp-target-pack.js";
export { createCsharpStarterProject } from "../descriptor/csharp-starter-project.js";
export { csharpTargetId } from "../target-model/identities/source.js";
export type {
  CsharpLanguageDialect,
  CsharpMemorySafetyRules,
  CsharpOutputType,
} from "../target-model/configuration/model.js";
export type { CsharpProjectReference } from "../target-model/project/references.js";

export function createTsonicPlugin() {
  return {
    kind: "target" as const,
    id: "@tsonic/target-csharp",
    targetId: csharpTargetId,
    createTargetPack: createCsharpTargetPack,
    createStarterProject: createCsharpStarterProject,
  };
}
