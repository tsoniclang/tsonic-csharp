// nextgen C-2542 (K-2668, B7): createTargetSourceProgram is the composition root's entry, exported from
// @tsonic/target-api/host. Tests may import /host; tsonic-csharp/src may not (I2).
import { createTargetSourceProgram } from "@tsonic/target-api/host";
import { createJsSourceApiFacts } from "@tsonic/js-source-profile";
import { tsonicCoreSourceAnalyses } from "@tsonic/source-core";
import { resolveCsharpPlatform } from "../../dist/target-model/configuration/platform.js";

// The target program view of a checked source, built with the options the composition root passes
// (tsonic/packages/host/src/build.ts): the JS API profile and the source-core analyses (nextgen C-2542, B1/B2).
// Tests that compile read the analysis program's own `program.source`; tests that only check a source use this.
// The platform premise is the C# target's own default (a generated project stating no architecture, E24), so a program
// built here agrees with createCsharpCompilationSession(...).sourcePlatform() for a default configuration. A session with
// stated properties passes its own premise.
const defaultPlatform = resolveCsharpPlatform(Object.freeze({ kind: "generated" }), Object.freeze({})).premise;
const compositionRoot = Object.freeze({ profile: createJsSourceApiFacts, analyses: Object.freeze([tsonicCoreSourceAnalyses]) });

export function csharpTestSourceProgram(checked, platform = defaultPlatform) {
  return createTargetSourceProgram(checked, { ...compositionRoot, platform });
}
