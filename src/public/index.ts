export { createCsharpTargetPack } from "../descriptor/target-pack.js";
export { createCsharpStarterProject } from "../descriptor/starter-project.js";
export { csharpTargetId } from "../target-model/identities/source.js";
export type {
  CsharpLanguageDialect,
  CsharpMemorySafetyRules,
  CsharpOutputType,
} from "../target-model/configuration/model.js";
export type { CsharpProjectReference } from "../target-model/project/references.js";

export { createTsonicPlugin } from "../compilation/plugin.js";
