import type { CsharpCompilationUnit } from "../target-ast/roslyn/index.js";
import type { CsharpProjectPlan } from "./project/model.js";

export interface CsharpOutputPlan {
  readonly project: CsharpProjectPlan;
  readonly sources: readonly CsharpOutputSourceFile[];
}

export interface CsharpOutputSourceFile {
  readonly path: string;
  readonly unit: CsharpCompilationUnit;
}
