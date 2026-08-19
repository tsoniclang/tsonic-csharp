import type { CsharpCompilationUnit } from "../roslyn/syntax.js";
import type { CsharpProjectPlan } from "../project-model/csharp-project.js";

export interface CsharpOutputPlan {
  readonly project: CsharpProjectPlan;
  readonly sources: readonly CsharpOutputSourceFile[];
}

export interface CsharpOutputSourceFile {
  readonly path: string;
  readonly unit: CsharpCompilationUnit;
}
