import type {
  TargetCompileOutput,
  TargetArtifact,
  TargetSourceFile,
} from "@tsonic/target-api/artifacts";
import type { CsharpOutputPlan } from "../artifact-model/output.js";
import { printCsharpCompilationUnit } from "../../print/source/index.js";
import { printCsharpProjectFile } from "../../print/project/csharp-project.js";
import { printCsharpRuntimeProject } from "../../print/project/csharp-runtime-project.js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function materializeCsharpOutputPlan(
  plan: CsharpOutputPlan,
): TargetCompileOutput {
  if (plan.project.kind === "generated") {
    for (const project of plan.project.project.runtimeProjects) {
      const text = printCsharpRuntimeProject(project);
      if (existsSync(project.path) && readFileSync(project.path, "utf8") === text) continue;
      mkdirSync(dirname(project.path), { recursive: true });
      const temporaryPath = join(dirname(project.path), `${randomUUID()}.tmp`);
      writeFileSync(temporaryPath, text);
      renameSync(temporaryPath, project.path);
    }
  }
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
