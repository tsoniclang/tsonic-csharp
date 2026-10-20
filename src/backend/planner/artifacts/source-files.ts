import type { CsharpPlanningContext } from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { planSourceFile, type PlannedCsharpSourceFile } from "../program/source-file.js";
import { planCsharpObjectShapeSourceFile } from "../objects/planning.js";

export interface CsharpSourceFilePlan {
  readonly sourceFiles: readonly PlannedCsharpSourceFile[];
  readonly objectShapes: ReturnType<typeof planCsharpObjectShapeSourceFile>;
}

export function planCsharpSourceFiles(input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[]): CsharpSourceFilePlan {
  const sourceFiles: PlannedCsharpSourceFile[] = [];
  for (const { sourceFile } of input.program.records.sourceArtifacts.get()) {
    const planned = planSourceFile(sourceFile, input, diagnostics);
    if (planned !== undefined) sourceFiles.push(planned);
  }
  return Object.freeze({ sourceFiles: Object.freeze(sourceFiles),
    objectShapes: planCsharpObjectShapeSourceFile(input, diagnostics) });
}
