import type {
  TargetCompileOutput,
  TargetArtifact,
  TargetSourceFile,
} from "@tsonic/target-api/artifacts";
import type { CsharpOutputPlan } from "../artifact-model/output.js";
import { printCsharpCompilationUnit } from "../../print/source/index.js";
import { printCsharpProjectFile } from "../../print/project/csharp-project.js";

export function materializeCsharpOutputPlan(
  plan: CsharpOutputPlan,
): TargetCompileOutput {
  const sourceArtifacts: readonly TargetSourceFile[] = Object.freeze(plan.sources.map((source) => Object.freeze({
    kind: "source",
    language: "csharp",
    path: source.path,
    text: printCsharpCompilationUnit(source.unit),
  })));
  const artifacts: readonly TargetArtifact[] = plan.project.kind === "generated"
    ? Object.freeze([
        Object.freeze({
          kind: "project",
          path: plan.project.project.path,
          text: printCsharpProjectFile(plan.project.project),
        }),
        ...sourceArtifacts,
      ])
    : sourceArtifacts;
  return Object.freeze({ artifacts: Object.freeze(artifacts) });
}
