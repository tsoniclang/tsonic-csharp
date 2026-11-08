import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";

export interface CsharpSafetyApplicationFactIndex {
  readonly all: readonly CsharpSafetyApplication[];
  readonly sourceSafetyApplication: { readonly get: (sourceFile: SourceFile) => readonly CsharpSafetyApplication[] };
  readonly safetyApplication: { readonly get: (declaration: Node) => readonly CsharpSafetyApplication[] };
  readonly safetyOperation: { readonly get: (subject: Node) => CsharpSafetyOperation | undefined };
}

type PublishedSafety = Extract<ReturnType<SourceProgramFacts["protocols"]["safety"]>, { readonly kind: "resolved" }>["value"];

export type CsharpSafetyOperation = Extract<PublishedSafety, { readonly kind: "present" }>["value"];

export type CsharpSafetyApplication = Extract<Extract<CsharpSafetyOperation, { readonly kind: "safety-builder" }>["fact"],
  { readonly kind: "application" }> & {
  readonly sourceSubject: Node;
  readonly sourceFile: SourceFile;
  readonly resolvedRootDeclaration: Node | undefined;
  readonly targetDeclarations: readonly Node[];
};
