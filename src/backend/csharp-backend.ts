import type { TargetBackend, TargetBackendContext, TargetCompileInput, TargetCompileResult } from "@tsonic/target-api";
import { planCsharpArtifacts } from "./planner/csharp-planner.js";
import { createCsharpTranslationContext } from "../translate/context/index.js";

export function createCsharpBackend(context: TargetBackendContext): TargetBackend {
  return {
    compile(input: TargetCompileInput): TargetCompileResult {
      return planCsharpArtifacts(createCsharpTranslationContext(context, input));
    },
  };
}
