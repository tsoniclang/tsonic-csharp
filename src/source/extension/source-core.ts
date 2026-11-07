// The source-core Host analyses of one program (memory, memory bindings, pointers): checker-free records published as
// facts.analyses.extension(tsonicCoreAnalysisKey) (I1, I2). C# never reads the Legacy source-core witness facts.
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import { tsonicCoreAnalysisKey, type TsonicCoreSourceAnalyses } from "@tsonic/source-core/facts";

export function csharpSourceCoreAnalyses(facts: Pick<SourceProgramFacts, "analyses">): TsonicCoreSourceAnalyses {
  return facts.analyses.extension(tsonicCoreAnalysisKey);
}
