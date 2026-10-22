import type { TargetCompileInput } from "@tsonic/target-api";
import type { TargetSourceSyntaxProgram } from "@tsonic/target-api/analysis";
import type { CsharpProgramRecords } from "./program.js";

export interface CsharpTargetProgram {
  readonly source: Pick<TargetSourceSyntaxProgram, "ast">;
  readonly records: CsharpProgramRecords;
  readonly host: {
    readonly paths: TargetCompileInput["paths"];
    readonly entryPoint: string;
  };
}
