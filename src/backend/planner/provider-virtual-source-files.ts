import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";

export function isProviderVirtualSourceFile(input: TargetCompileInput, sourceFile: SourceFile | undefined): boolean {
  return sourceFile !== undefined &&
    input.facts.getFact(sourceFile, providerVirtualDeclarationFactKey) !== undefined;
}
