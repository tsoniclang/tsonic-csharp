import type { TargetArtifact, TargetSourceFile } from "@tsonic/target-api";
import { printCsharpCompilationUnit } from "../../print/csharp-printer.js";
import { printCsharpProjectFile } from "../../print/csharp-project-printer.js";
import type { CsharpCompilationUnit } from "../roslyn/syntax.js";
import type { CsharpProjectPlan } from "./project-artifacts.js";

export interface CsharpOutputPlan {
  readonly project: CsharpProjectPlan;
  readonly sources: readonly CsharpOutputSourceFile[];
}

export interface CsharpOutputSourceFile {
  readonly path: string;
  readonly unit: CsharpCompilationUnit;
}

export function materializeCsharpOutputPlan(plan: CsharpOutputPlan): readonly TargetArtifact[] {
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
