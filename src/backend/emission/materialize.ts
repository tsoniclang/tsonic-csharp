import type {
  TargetArtifact,
  TargetSourceFile,
} from "@tsonic/target-api/artifacts";
import type { CsharpOutputPlan } from "../artifacts/model.js";
import { printCsharpCompilationUnit } from "../../print/csharp/index.js";
import { printCsharpProjectFile } from "../../print/project/csharp-project.js";

export function materializeCsharpOutputPlan(
  plan: CsharpOutputPlan,
): readonly TargetArtifact[] {
  const sourceArtifacts: TargetSourceFile[] = plan.sources.map((source) => ({
    kind: "source",
    language: "csharp",
    path: source.path,
    text: printCsharpCompilationUnit(source.unit),
  }));
  return plan.project.kind === "generated"
    ? [
        {
          kind: "project",
          path: plan.project.project.path,
          text: printCsharpProjectFile(plan.project.project),
        },
        ...sourceArtifacts,
      ]
    : sourceArtifacts;
}
