import type { Node, SourceFile } from "@tsonic/tsts";

export interface CsharpModuleInitializationIndex {
  readonly moduleInitializationDependencies: { readonly get: (sourceFile: SourceFile) => readonly SourceFile[] };
  readonly requiresModuleInitializer: { readonly get: (sourceFile: SourceFile) => boolean };
  readonly asyncModuleInitializer: { readonly get: (sourceFile: SourceFile) => boolean };
  entrypointInitializer(): SourceFile | undefined;
  readonly callableVisibility: { readonly get: (declaration: Node) => "public" | "internal" | undefined };
}

export interface CsharpModuleInitializationIssue {
  readonly code: "CSHARP_UNSUPPORTED_RUNTIME_MODULE_CYCLE" | "TSONIC_UNCALLED_BINARY_ENTRY_MAIN";
  readonly node?: Node;
  readonly message: string;
  readonly evidence: readonly string[];
}

export interface CsharpModuleInitializationAnalysis {
  readonly index: CsharpModuleInitializationIndex;
  readonly issues: readonly CsharpModuleInitializationIssue[];
}
