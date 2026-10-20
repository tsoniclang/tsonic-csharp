import type { TargetDiagnostic, TargetRuntimeReference, TargetStageResult } from "@tsonic/target-api/artifacts";
import { rejectedTargetStage, resolvedTargetStage } from "@tsonic/target-api/artifacts";
import type { CsharpTargetConfiguration } from "../target-model/configuration/model.js";
import type { CsharpProjectReference } from "../target-model/project/references.js";
import type { CsharpProjectClassifications } from "../target-model/project/plan.js";
import type { CsharpRuntimeSourceProject } from "../target-model/project/runtime.js";
import { classifyCsharpRuntimeSource, instantiateCsharpRuntimeSources, validateCsharpRuntimeSources } from "../providers/runtime/projects.js";
import { canonicalProjectReferences, csharpAssemblyName, csharpNamespace, csharpProjectProperties, projectDiagnostic } from "../options/project.js";

export function classifyCsharpProjectConfiguration(
  configuration: CsharpTargetConfiguration,
  runtimeReferences: readonly TargetRuntimeReference[],
  cacheRoot: string,
): TargetStageResult<CsharpProjectClassifications> {
  const diagnostics: TargetDiagnostic[] = [];
  const assemblyName = csharpAssemblyName(
    configuration.assemblyName ?? "TsonicGenerated",
    diagnostics,
  );
  const namespace = csharpNamespace(
    configuration.namespace ?? "Tsonic.Generated",
    diagnostics,
  );
  const runtimeProjectReferences: CsharpProjectReference[] = [];
  let runtimeSources: readonly CsharpRuntimeSourceProject[] = [];
  const collectedRuntimeSources: CsharpRuntimeSourceProject[] = [];
  for (let index = 0; index < runtimeReferences.length; index += 1) {
    if (!(index in runtimeReferences)) {
      diagnostics.push(projectDiagnostic(
        "CSHARP_RUNTIME_REFERENCE_INVALID",
        `The C# target rejected sparse runtime reference slot ${index}.`,
        [`runtime.reference.index=${index}`],
      ));
      continue;
    }
    const runtimeReference = runtimeReferences[index];
    if (runtimeReference?.kind === "csharp-source-project") {
      try {
        collectedRuntimeSources.push(classifyCsharpRuntimeSource(runtimeReference));
      } catch (error) {
        diagnostics.push(projectDiagnostic("CSHARP_RUNTIME_REFERENCE_INVALID", String(error), [`runtime.reference.index=${index}`]));
      }
      continue;
    }
    const result = csharpRuntimeProjectReference(runtimeReference, index);
    if (result.kind === "rejected") {
      diagnostics.push(result.diagnostic);
      continue;
    }
    runtimeProjectReferences.push(result.reference);
  }
  try {
    runtimeSources = validateCsharpRuntimeSources(collectedRuntimeSources);
  } catch (error) {
    diagnostics.push(projectDiagnostic("CSHARP_RUNTIME_REFERENCE_INVALID", String(error), []));
  }
  const references = canonicalProjectReferences(
    [...configuration.references, ...runtimeProjectReferences],
    diagnostics,
  );
  const properties = csharpProjectProperties(configuration, diagnostics);
  if (
    diagnostics.length > 0 ||
    assemblyName === undefined ||
    namespace === undefined
  ) {
    return rejectedTargetStage(diagnostics);
  }
  return resolvedTargetStage(Object.freeze({
    assemblyName,
    namespace,
    project: configuration.project,
    properties,
    references,
    runtimeSources,
    runtimeProjects: instantiateCsharpRuntimeSources(runtimeSources, configuration.targetFramework, cacheRoot),
  }));
}

type RuntimeReferenceResult =
  | { readonly kind: "resolved"; readonly reference: CsharpProjectReference }
  | { readonly kind: "rejected"; readonly diagnostic: TargetDiagnostic };

function csharpRuntimeProjectReference(
  value: unknown,
  index: number,
): RuntimeReferenceResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return rejectedRuntimeReference(
      index,
      "reference must be an object.",
      value,
    );
  }
  const reference = value as Partial<TargetRuntimeReference>;
  if (typeof reference.include !== "string" || reference.include.length === 0) {
    return rejectedRuntimeReference(
      index,
      "include must be a non-empty string.",
      reference.include,
    );
  }
  switch (reference.kind) {
    case "project": {
      const issue = referenceShapeIssue(reference, [], false);
      return issue === undefined
        ? resolvedRuntimeReference({ kind: "project", include: reference.include })
        : rejectedRuntimeReference(index, issue, reference.include);
    }
    case "package": {
      const issue = referenceShapeIssue(
        reference,
        ["PrivateAssets", "IncludeAssets"],
        true,
      );
      if (issue !== undefined) {
        return rejectedRuntimeReference(index, issue, reference.include);
      }
      return resolvedRuntimeReference(Object.freeze({
        kind: "package",
        include: reference.include,
        ...(reference.version === undefined ? {} : { version: reference.version }),
        ...(reference.attributes?.PrivateAssets === undefined
          ? {}
          : { privateAssets: reference.attributes.PrivateAssets }),
        ...(reference.attributes?.IncludeAssets === undefined
          ? {}
          : { includeAssets: reference.attributes.IncludeAssets }),
      }));
    }
    case "framework": {
      const issue = referenceShapeIssue(reference, [], false);
      return issue === undefined
        ? resolvedRuntimeReference({ kind: "framework", include: reference.include })
        : rejectedRuntimeReference(index, issue, reference.include);
    }
    case "assembly": {
      const issue = referenceShapeIssue(reference, ["HintPath"], false);
      if (issue !== undefined) {
        return rejectedRuntimeReference(index, issue, reference.include);
      }
      return resolvedRuntimeReference(Object.freeze({
        kind: "assembly",
        include: reference.include,
        ...(reference.attributes?.HintPath === undefined
          ? {}
          : { hintPath: reference.attributes.HintPath }),
      }));
    }
    default:
      return rejectedRuntimeReference(
        index,
        `kind '${String(reference.kind)}' is not supported by the C# target.`,
        reference.include,
      );
  }
}

function referenceShapeIssue(
  reference: Partial<TargetRuntimeReference>,
  allowedAttributes: readonly string[],
  versionAllowed: boolean,
): string | undefined {
  if (!versionAllowed && reference.version !== undefined) {
    return `kind '${reference.kind}' cannot declare a version.`;
  }
  if (
    reference.version !== undefined &&
    (typeof reference.version !== "string" || reference.version.length === 0)
  ) {
    return "version must be a non-empty string when present.";
  }
  if (reference.attributes === undefined) {
    return undefined;
  }
  if (
    typeof reference.attributes !== "object" ||
    reference.attributes === null ||
    Array.isArray(reference.attributes)
  ) {
    return "attributes must be an object when present.";
  }
  for (const [name, value] of Object.entries(reference.attributes)) {
    if (!allowedAttributes.includes(name)) {
      return `kind '${reference.kind}' does not support attribute '${name}'.`;
    }
    if (typeof value !== "string") {
      return `attribute '${name}' must be a string.`;
    }
  }
  return undefined;
}

function resolvedRuntimeReference(
  reference: CsharpProjectReference,
): RuntimeReferenceResult {
  return { kind: "resolved", reference: Object.freeze(reference) };
}

function rejectedRuntimeReference(
  index: number,
  reason: string,
  include: unknown,
): RuntimeReferenceResult {
  return {
    kind: "rejected",
    diagnostic: projectDiagnostic(
      "CSHARP_RUNTIME_REFERENCE_INVALID",
      `The C# target rejected runtime reference ${index}: ${reason}`,
      [
        `runtime.reference.index=${index}`,
        `runtime.reference.include=${String(include)}`,
      ],
    ),
  };
}
