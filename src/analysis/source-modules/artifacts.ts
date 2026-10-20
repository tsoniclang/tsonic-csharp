import { analyzeSourceArtifactFiles } from "@tsonic/target-api/analysis";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceModuleConstructionIndex } from "../../target-model/records/source-modules.js";
import { createCsharpSourceArtifactRecords } from "../program/records/artifacts.js";

export function analyzeCsharpSourceArtifacts(source: TargetSourceProgram, constructions: CsharpSourceModuleConstructionIndex) {
  const selected = analyzeSourceArtifactFiles({ ast: source.ast, sourceFiles: source.navigation.sourceFiles,
    navigation: source.navigation, constructions: constructions.entries() });
  const issues: readonly TargetDiagnostic[] = Object.freeze(selected.issues.map(issue => ({
    category: "error" as const, source: "tsonic-csharp", sourceNode: issue.sourceFile,
    code: issue.kind === "source-identity" ? "CSHARP_SOURCE_FILE_ARTIFACT_IDENTITY_MISSING"
      : issue.kind === "source-conflict" ? "CSHARP_SOURCE_FILE_ARTIFACT_IDENTITY_CONFLICT"
      : issue.kind === "module-identity" ? "CSHARP_SOURCE_FILE_DEPENDENCY_IDENTITY_MISSING"
      : "CSHARP_SOURCE_MODULE_DEPENDENCY_IDENTITY_MISSING",
    message: issue.kind === "source-identity" ? "One project source file has no stable compiler-owned identity for target artifact reconstruction."
      : issue.kind === "source-conflict" ? `Multiple project source files resolve to target artifact owner '${issue.owner}'.`
      : issue.kind === "module-identity" ? `A project module referenced by '${issue.owner}' has no stable target artifact identity.`
      : `A source module constructed by '${issue.owner}' has no stable target artifact identity.`,
  })));
  return Object.freeze({ records: createCsharpSourceArtifactRecords(selected.files), issues });
}
