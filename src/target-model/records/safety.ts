import type { TsonicSafetyApplicationFact, TsonicSafetyBuilderFact, TsonicUnsafeContextFact } from "@tsonic/source-core/facts";
import type { Node, SourceFile } from "@tsonic/tsts";

export interface CsharpSafetyApplicationFactIndex {
  readonly all: readonly CsharpSafetyApplication[];
  readonly sourceSafetyApplication: { readonly get: (sourceFile: SourceFile) => readonly CsharpSafetyApplication[] };
  readonly safetyApplication: { readonly get: (declaration: Node) => readonly CsharpSafetyApplication[] };
  readonly safetyOperation: { readonly get: (subject: Node) => CsharpSafetyOperation | undefined };
}

export interface CsharpSafetyApplication extends TsonicSafetyApplicationFact {
  readonly sourceSubject: Node;
  readonly sourceFile: SourceFile;
  readonly selectedMemberDeclarations: readonly Node[];
  readonly resolvedRootDeclaration?: Node;
  readonly targetDeclarations: readonly Node[];
}

export type CsharpSafetyOperation =
  | { readonly kind: "unsafe-context"; readonly fact: TsonicUnsafeContextFact }
  | { readonly kind: "safety-builder"; readonly fact: TsonicSafetyBuilderFact };
