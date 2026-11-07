import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createJsSourceApiFacts } from "@tsonic/js-source-profile";
import { tsonicCoreSourceAnalyses } from "@tsonic/source-core";

// The target program view of a checked source, built with the options the composition root passes
// (tsonic/packages/host/src/build.ts): the JS API profile and the source-core analyses (nextgen C-2542, B1/B2).
// Tests that compile read the analysis program's own `program.source`; tests that only check a source use this.
const compositionRoot = Object.freeze({ profile: createJsSourceApiFacts, analyses: Object.freeze([tsonicCoreSourceAnalyses]) });

export function csharpTestSourceProgram(checked) {
  return createTargetSourceProgram(checked, compositionRoot);
}
