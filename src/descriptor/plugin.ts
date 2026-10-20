import { createCsharpTargetPack } from "./target-pack.js";
import { createCsharpStarterProject } from "./starter-project.js";
import { csharpTargetId } from "../target-model/identities/target.js";

export function createTsonicPlugin() {
  return {
    kind: "target" as const,
    id: "@tsonic/target-csharp",
    targetId: csharpTargetId,
    createTargetPack: createCsharpTargetPack,
    createStarterProject: createCsharpStarterProject,
  };
}
