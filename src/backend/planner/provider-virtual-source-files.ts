import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  SourceFile,
} from "@tsonic/tsts";

export function isProviderVirtualSourceFile(input: CsharpTranslationContext, sourceFile: SourceFile | undefined): boolean {
  return sourceFile !== undefined &&
    input.ast.getFileName(sourceFile).startsWith("tsts-provider://");
}
