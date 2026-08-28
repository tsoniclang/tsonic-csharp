import type {
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetArtifactContractGraph,
  TargetArtifactDependency,
  TargetArtifactReconstruction,
  TargetDiagnostic,
} from "@tsonic/target-api/artifacts";
import { sourceFileIdentity } from "@tsonic/target-api/source";
import { reconstructTargetArtifacts } from "@tsonic/target-api/artifacts";
import type {
  CsharpArtifactSnapshot,
  CsharpArtifactFacet,
} from "./index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpModuleInitializationPlan,
} from "../program/module-initialization.js";
import {
  planSourceFile,
} from "../program/source-file.js";
import type {
  PlannedCsharpSourceFile,
} from "../program/source-file.js";
import {
  csharpSourceFileContractCandidate,
} from "./source-file-contract.js";

const minimumCsharpArtifactReconstructionCount = 64;
const maximumReconstructionsPerSourceFile = 32;

export function reconstructCsharpSourceFiles(
  input: CsharpPlanningContext,
  moduleInitialization: CsharpModuleInitializationPlan,
  diagnostics: TargetDiagnostic[],
): readonly PlannedCsharpSourceFile[] | undefined {
  const sourceFilesByOwner = new Map<string, SourceFile>();
  const ownerBySourceFile = new Map<SourceFile, string>();
  for (const sourceFile of input.program.sourceNavigation.sourceFiles) {
    const owner = sourceFileArtifactOwner(input, sourceFile);
    if (owner === undefined) {
      diagnostics.push(reconstructionDiagnostic(
        "CSHARP_SOURCE_FILE_ARTIFACT_IDENTITY_MISSING",
        "One project source file has no stable compiler-owned identity for target artifact reconstruction.",
      ));
      return undefined;
    }
    if (sourceFilesByOwner.has(owner)) {
      diagnostics.push(reconstructionDiagnostic(
        "CSHARP_SOURCE_FILE_ARTIFACT_IDENTITY_CONFLICT",
        `Multiple project source files resolve to target artifact owner '${owner}'.`,
      ));
      return undefined;
    }
    sourceFilesByOwner.set(owner, sourceFile);
    ownerBySourceFile.set(sourceFile, owner);
  }

  const plannedByOwner = new Map<string, PlannedCsharpSourceFile | undefined>();
  const maximumReconstructionCount = csharpArtifactReconstructionBudget(
    sourceFilesByOwner.size,
  );
  if (maximumReconstructionCount === undefined) {
    diagnostics.push(reconstructionDiagnostic(
      "CSHARP_TARGET_ARTIFACT_RECONSTRUCTION_BUDGET_INVALID",
      "The project source-file count cannot produce a finite target artifact reconstruction budget.",
    ));
    return undefined;
  }
  const diagnosticsByOwner = new Map<string, readonly TargetDiagnostic[]>();
  const reconstruction = reconstructTargetArtifacts(
    input.artifacts.contractGraph,
    [...sourceFilesByOwner.keys()].sort((left, right) =>
      left.localeCompare(right)
    ),
    (owner, graph): TargetArtifactReconstruction<
      CsharpArtifactFacet,
      CsharpArtifactSnapshot
    > => {
      const sourceFile = sourceFilesByOwner.get(owner);
      if (sourceFile === undefined) {
        return input.artifacts.reconstructArtifact(owner);
      }

      const revision = graph.revision;
      const candidateDiagnostics: TargetDiagnostic[] = [];
      const moduleDependencies = sourceFilePublicDependencies(
        input,
        sourceFile,
        owner,
        ownerBySourceFile,
      );
      if (moduleDependencies.kind === "rejected") {
        return moduleDependencies;
      }
      const captured = input.artifacts.captureDependencies(owner, () =>
        planSourceFile(
          sourceFile,
          input,
          candidateDiagnostics,
          moduleInitialization,
        )
      );
      if (graph.revision !== revision) {
        return {
          kind: "retry",
          reason:
            "Planning discovered or strengthened an exact prerequisite target artifact contract.",
        };
      }
      if (candidateDiagnostics.length > 0) {
        const unpublished = unpublishedDependencies(
          graph,
          [...moduleDependencies.dependencies, ...captured.dependencies],
        );
        if (unpublished.length > 0) {
          return {
            kind: "blocked",
            reason:
              "C# source planning requires finalized imported public surfaces before its diagnostics are authoritative.",
            dependencies: unpublished,
          };
        }
        diagnosticsByOwner.set(owner, Object.freeze([...candidateDiagnostics]));
        return {
          kind: "rejected",
          code: "CSHARP_SOURCE_FILE_RECONSTRUCTION_REJECTED",
          reason:
            `C# source artifact '${owner}' produced target diagnostics during reconstruction.`,
        };
      }
      const candidate = csharpSourceFileContractCandidate(
        owner,
        captured.value?.unit,
        [...moduleDependencies.dependencies, ...captured.dependencies],
      );
      if (candidate.kind === "rejected") {
        return {
          kind: "rejected",
          code: "CSHARP_SOURCE_FILE_CONTRACT_INVALID",
          reason: candidate.reason,
        };
      }
      plannedByOwner.set(owner, captured.value);
      return {
        kind: "resolved",
        contract: candidate.candidate.contract,
        dependencies: candidate.candidate.dependencies,
        artifact: candidate.candidate.artifact,
      };
    },
    { maximumReconstructionCount },
  );
  if (reconstruction.kind === "rejected") {
    diagnostics.push(reconstructionDiagnostic(
      reconstruction.code,
      reconstruction.reason,
    ));
    return undefined;
  }
  if (reconstruction.kind === "failed") {
    for (const failure of reconstruction.failures) {
      diagnostics.push(...(
        diagnosticsByOwner.get(failure.owner) ?? [reconstructionDiagnostic(
          failure.code,
          failure.reason,
        )]
      ));
    }
    return undefined;
  }
  const closure = input.artifacts.verifyContractClosure();
  if (closure.kind === "rejected") {
    diagnostics.push(reconstructionDiagnostic(
      "CSHARP_TARGET_ARTIFACT_CONTRACT_OPEN",
      closure.reason,
    ));
    return undefined;
  }
  return Object.freeze(
    input.program.sourceNavigation.sourceFiles.flatMap((sourceFile) => {
      const owner = ownerBySourceFile.get(sourceFile);
      const planned = owner === undefined ? undefined : plannedByOwner.get(owner);
      return planned === undefined ? [] : [planned];
    }),
  );
}

function unpublishedDependencies(
  graph: TargetArtifactContractGraph<
    CsharpArtifactFacet,
    CsharpArtifactSnapshot
  >,
  dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[],
): readonly TargetArtifactDependency<CsharpArtifactFacet>[] {
  const byKey = new Map<string, TargetArtifactDependency<CsharpArtifactFacet>>();
  for (const dependency of dependencies) {
    if (!graph.hasPublishedFacet(dependency)) {
      byKey.set(
        `${dependency.owner.length}:${dependency.owner}${dependency.facet.length}:${dependency.facet}`,
        dependency,
      );
    }
  }
  return Object.freeze([...byKey.values()].sort((left, right) =>
    left.owner.localeCompare(right.owner) ||
    left.facet.localeCompare(right.facet)
  ));
}

function csharpArtifactReconstructionBudget(
  sourceFileCount: number,
): number | undefined {
  const proportional = sourceFileCount * maximumReconstructionsPerSourceFile;
  if (!Number.isSafeInteger(proportional) || proportional < 0) {
    return undefined;
  }
  return Math.max(minimumCsharpArtifactReconstructionCount, proportional);
}

function sourceFilePublicDependencies(
  input: CsharpPlanningContext,
  sourceFile: SourceFile,
  owner: string,
  ownerBySourceFile: ReadonlyMap<SourceFile, string>,
):
  | {
      readonly kind: "resolved";
      readonly dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[];
    }
  | {
      readonly kind: "rejected";
      readonly code: string;
      readonly reason: string;
    } {
  const dependencies: TargetArtifactDependency<CsharpArtifactFacet>[] = [];
  for (const reference of input.program.sourceNavigation.moduleReferences(sourceFile)) {
    const dependencyOwner = ownerBySourceFile.get(reference.sourceFile) ??
      sourceFileArtifactOwner(input, reference.sourceFile);
    if (dependencyOwner === undefined) {
      return {
        kind: "rejected",
        code: "CSHARP_SOURCE_FILE_DEPENDENCY_IDENTITY_MISSING",
        reason:
          `A project module referenced by '${owner}' has no stable target artifact identity.`,
      };
    }
    if (dependencyOwner !== owner) {
      dependencies.push({
        owner: dependencyOwner,
        facet: "source-file-public-surface",
      });
    }
  }
  for (const construction of input.program.sourceModuleConstructions.from(
    sourceFile,
  )) {
    const dependencyOwner = ownerBySourceFile.get(
      construction.targetSourceFile,
    ) ?? sourceFileArtifactOwner(input, construction.targetSourceFile);
    if (dependencyOwner === undefined) {
      return {
        kind: "rejected",
        code: "CSHARP_SOURCE_MODULE_DEPENDENCY_IDENTITY_MISSING",
        reason:
          `A source module constructed by '${owner}' has no stable target artifact identity.`,
      };
    }
    if (dependencyOwner !== owner) {
      dependencies.push({
        owner: dependencyOwner,
        facet: "source-file-implementation",
      });
    }
  }
  return {
    kind: "resolved",
    dependencies: Object.freeze(uniqueDependencies(dependencies)),
  };
}

function uniqueDependencies(
  dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[],
): readonly TargetArtifactDependency<CsharpArtifactFacet>[] {
  const byIdentity = new Map<string, TargetArtifactDependency<CsharpArtifactFacet>>();
  for (const dependency of dependencies) {
    byIdentity.set(
      `${dependency.owner.length}:${dependency.owner}:${dependency.facet}`,
      dependency,
    );
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.owner.localeCompare(right.owner) ||
    left.facet.localeCompare(right.facet));
}

function sourceFileArtifactOwner(
  input: CsharpPlanningContext,
  sourceFile: SourceFile,
): string | undefined {
  const identity = sourceFileIdentity(input.program.source.ast, sourceFile);
  return identity === undefined ? undefined : `source-file:${identity}`;
}

function reconstructionDiagnostic(
  code: string,
  message: string,
): TargetDiagnostic {
  return {
    code,
    category: "error",
    source: "tsonic-csharp",
    message,
  };
}
