import type { CsharpPlanningContext } from "../context.js";
import type {
  SourceFile,
} from "@tsonic/tsts";

export function isProviderVirtualSourceFile(input: CsharpPlanningContext, sourceFile: SourceFile | undefined): boolean {
  return sourceFile !== undefined &&
    input.ast.getFileName(sourceFile).startsWith("tsts-provider://");
}
