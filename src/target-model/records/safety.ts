import type { TsonicSafetyApplicationFact, TsonicSafetyBuilderFact, TsonicUnsafeContextFact } from "@tsonic/source-core/facts";
import type { TargetSafetyApplication, TargetSafetyApplicationFindings, TargetSafetyOperation } from "@tsonic/target-api/analysis";
import type { Node, SourceFile } from "@tsonic/tsts";

export interface CsharpSafetyApplicationFactIndex {
  readonly all: readonly CsharpSafetyApplication[];
  readonly sourceSafetyApplication: { readonly get: (sourceFile: SourceFile) => readonly CsharpSafetyApplication[] };
  readonly safetyApplication: { readonly get: (declaration: Node) => readonly CsharpSafetyApplication[] };
  readonly safetyOperation: { readonly get: (subject: Node) => CsharpSafetyOperation | undefined };
  readonly findings: { readonly get: (sourceFile: SourceFile) => TargetSafetyApplicationFindings<CsharpSafetyApplication> };
}

export type CsharpSafetyApplication = TargetSafetyApplication<TsonicSafetyApplicationFact>;

export type CsharpSafetyOperation = TargetSafetyOperation<TsonicUnsafeContextFact, TsonicSafetyBuilderFact>;
