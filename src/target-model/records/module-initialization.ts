import type { Node, SourceFile } from "@tsonic/tsts";

export interface CsharpModuleInitializationIndex {
  readonly moduleInitializationDependencies: { get(sourceFile: SourceFile): readonly SourceFile[] };
  readonly requiresModuleInitializer: { get(sourceFile: SourceFile): boolean };
  readonly asyncModuleInitializer: { get(sourceFile: SourceFile): boolean };
  entrypointInitializer(): SourceFile | undefined;
  readonly callableVisibility: { get(declaration: Node): "public" | "internal" | undefined };
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
