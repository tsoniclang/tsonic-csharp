import { createCsharpTargetPack } from "../descriptor/target-pack.js";
import { createCsharpStarterProject } from "../descriptor/starter-project.js";
import { csharpTargetId } from "../target-model/identities/source.js";

export function createTsonicPlugin() {
  return {
    kind: "target" as const,
    id: "@tsonic/target-csharp",
    targetId: csharpTargetId,
    createTargetPack: createCsharpTargetPack,
    createStarterProject: createCsharpStarterProject,
  };
}
