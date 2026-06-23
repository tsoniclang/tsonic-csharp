import type { TargetArtifact, TargetSourceFile } from "@tsonic/target-api";
import { printCsharpCompilationUnit } from "../../print/csharp-printer.js";
import { printCsharpProjectFile } from "../../print/csharp-project-printer.js";
import type { CsharpCompilationUnit } from "../roslyn/syntax.js";
import type { CsharpProjectFile } from "./project-artifacts.js";

export interface CsharpOutputPlan {
  readonly project: CsharpProjectFile;
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
  return [
    {
      kind: "project",
      path: plan.project.path,
      text: printCsharpProjectFile(plan.project),
    },
    ...sourceArtifacts,
  ];
}
