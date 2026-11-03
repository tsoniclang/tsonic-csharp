import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpSourceCallContractSource } from "./call-contracts.js";

export interface CsharpSourceCallResultSource {
  readonly source: ResolvedSourceCallInfo;
  readonly sourceFile: SourceFile;
  readonly queries: SourceFileSemantics;
  readonly contract: CsharpSourceCallContractSource;
  readonly declaration: Node | undefined;
  readonly result: ReturnType<SourceFileSemantics["operations"]["callResult"]>;
}

export function formCsharpSourceCallResultSource(
  { sourceCallSelectedDeclaration }: Pick<CsharpTypeResolutionScope, "sourceCallSelectedDeclaration">,
  contract: CsharpSourceCallContractSource,
): CsharpSourceCallResultSource {
  const { source, sourceFile } = contract;
  const declaration = sourceCallSelectedDeclaration(source);
  const queries = contract.callableSource.queries;
  return Object.freeze({ source, sourceFile, queries, contract, declaration, result: queries.operations.callResult(source) });
}
