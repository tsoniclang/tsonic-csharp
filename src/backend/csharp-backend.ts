import { performance } from "node:perf_hooks";
import type { TargetBackend, TargetBackendContext, TargetCompileInput, TargetCompileResult } from "@tsonic/target-api";
import { planCsharpArtifacts } from "./planner/csharp-planner.js";
import { createCsharpTranslationContext } from "../translate/context/index.js";
import {
  dotnetProviderGlobalTelemetry,
  formatDotnetProviderTelemetrySnapshot,
} from "../providers/dotnet/reflection/telemetry.js";

export function createCsharpBackend(context: TargetBackendContext): TargetBackend {
  return {
    compile(input: TargetCompileInput): TargetCompileResult {
      const startedAt = performance.now();
      const result = planCsharpArtifacts(createCsharpTranslationContext(context, input));
      if (process.env["TSONIC_PHASE_TIMINGS"] === "1") {
        process.stderr.write(`timing: csharp-planning=${(performance.now() - startedAt).toFixed(1)}ms\n`);
        process.stderr.write(`${formatDotnetProviderTelemetrySnapshot(dotnetProviderGlobalTelemetry.snapshot())}\n`);
      }
      return result;
    },
  };
}
