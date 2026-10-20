import type { CsharpCompilationUnit } from "../target-ast/syntax/index.js";
import type { CsharpProjectPlan } from "../../target-model/project/emission.js";

export interface CsharpOutputPlan {
  readonly project: CsharpProjectPlan;
  readonly sources: readonly CsharpOutputSourceFile[];
}

export interface CsharpOutputSourceFile {
  readonly path: string;
  readonly unit: CsharpCompilationUnit;
}
