import type { SourceFile } from "@tsonic/tsts";

export interface CsharpModuleInitializationIndex {
  dependenciesFor(sourceFile: SourceFile): readonly SourceFile[];
  requiresInitializer(sourceFile: SourceFile): boolean;
  isAsync(sourceFile: SourceFile): boolean;
  entrypointInitializer(): SourceFile | undefined;
}

export interface CsharpModuleInitializationIssue {
  readonly code: "CSHARP_UNSUPPORTED_RUNTIME_MODULE_CYCLE";
  readonly message: string;
  readonly evidence: readonly string[];
}

export interface CsharpModuleInitializationAnalysis {
  readonly index: CsharpModuleInitializationIndex;
  readonly issues: readonly CsharpModuleInitializationIssue[];
}
