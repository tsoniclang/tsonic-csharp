import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpTypeResolutionScope } from "./scope.js";

export interface CsharpSourceCallResultSource {
  readonly source: ResolvedSourceCallInfo;
  readonly sourceFile: SourceFile;
  readonly queries: SourceFileSemantics;
  readonly declaration: Node | undefined;
  readonly result: ReturnType<SourceFileSemantics["operations"]["callResult"]>;
}

export function formCsharpSourceCallResultSource(
  { host, sourceCallSelectedDeclaration }: Pick<CsharpTypeResolutionScope, "host" | "sourceCallSelectedDeclaration">,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpSourceCallResultSource {
  const declaration = sourceCallSelectedDeclaration(source);
  const queries = host.semantics(sourceFile);
  return Object.freeze({ source, sourceFile, queries, declaration, result: queries.operations.callResult(source) });
}
