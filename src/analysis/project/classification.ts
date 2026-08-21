import type {
  TargetDiagnostic,
  TargetRuntimeReference,
  TargetStageResult,
} from "@tsonic/target-api/artifacts";
import {
  rejectedTargetStage,
  resolvedTargetStage,
} from "@tsonic/target-api/artifacts";
import type {
  CsharpTargetConfiguration,
} from "../../target-model/configuration/model.js";
import {
  sanitizeIdentifier,
} from "../../target-model/names/identifiers.js";
import type {
  CsharpProjectProperty,
} from "../../target-model/project/model.js";
import type {
  CsharpProjectReference,
} from "../../target-model/project/references.js";
import type {
  CsharpProjectClassifications,
} from "./model.js";

const targetOwnedProjectProperties = new Set([
  "AllowUnsafeBlocks",
  "Features",
  "ImplicitUsings",
  "LangVersion",
  "Nullable",
  "OutputType",
  "PublishAot",
  "TargetFramework",
]);

export function analyzeCsharpProject(
  configuration: CsharpTargetConfiguration,
  runtimeReferences: readonly TargetRuntimeReference[],
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
  for (let index = 0; index < runtimeReferences.length; index += 1) {
    if (!(index in runtimeReferences)) {
      diagnostics.push(projectDiagnostic(
        "CSHARP_RUNTIME_REFERENCE_INVALID",
        `The C# target rejected sparse runtime reference slot ${index}.`,
        [`runtime.reference.index=${index}`],
      ));
      continue;
    }
    const result = csharpRuntimeProjectReference(runtimeReferences[index], index);
    if (result.kind === "rejected") {
      diagnostics.push(result.diagnostic);
      continue;
    }
    runtimeProjectReferences.push(result.reference);
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
  }));
}

function csharpAssemblyName(
  value: string,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(value)) {
    diagnostics.push(projectDiagnostic(
      "CSHARP_PROJECT_ASSEMBLY_NAME_INVALID",
      "C# target assemblyName must be a file-safe .NET assembly name.",
      [`target.project.assemblyName=${value}`],
    ));
    return undefined;
  }
  return value;
}

function csharpNamespace(
  value: string,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const segments = value.split(".");
  if (segments.some((segment) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(segment))) {
    diagnostics.push(projectDiagnostic(
      "CSHARP_PROJECT_NAMESPACE_INVALID",
      "C# target namespace must be a dot-separated C# identifier path.",
      [`target.project.namespace=${value}`],
    ));
    return undefined;
  }
  return segments.map(sanitizeIdentifier).join(".");
}

function csharpProjectProperties(
  configuration: CsharpTargetConfiguration,
  diagnostics: TargetDiagnostic[],
): readonly CsharpProjectProperty[] {
  const properties = new Map<string, string>();
  properties.set("TargetFramework", configuration.targetFramework);
  properties.set("Nullable", configuration.nullable === false ? "disable" : "enable");
  properties.set("ImplicitUsings", configuration.implicitUsings === true ? "enable" : "disable");
  properties.set(
    "LangVersion",
    configuration.languageDialect === "csharp14" ? "14.0" : "preview",
  );
  properties.set("OutputType", configuration.outputType);
  if (configuration.memorySafetyRules === "preview") {
    properties.set("Features", "updated-memory-safety-rules");
  }
  if (configuration.publishAot !== undefined) {
    properties.set("PublishAot", configuration.publishAot ? "true" : "false");
  }
  for (const [name, value] of Object.entries(configuration.properties).sort(
    ([left], [right]) => left.localeCompare(right, "en"),
  )) {
    if (targetOwnedProjectProperties.has(name)) {
      diagnostics.push(projectDiagnostic(
        "CSHARP_PROJECT_PROPERTY_OWNERSHIP_INVALID",
        `C# target property '${name}' is target-owned and must use its dedicated target option.`,
        [`target.project.property=${name}`],
      ));
      continue;
    }
    properties.set(name, String(value));
  }
  return Object.freeze([...properties.entries()].map(([name, value]) =>
    Object.freeze({ name, value })));
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

function canonicalProjectReferences(
  references: readonly CsharpProjectReference[],
  diagnostics: TargetDiagnostic[],
): readonly CsharpProjectReference[] {
  const byIdentity = new Map<string, CsharpProjectReference>();
  for (const reference of references) {
    const identity = `${reference.kind}\u0000${reference.include}`;
    const existing = byIdentity.get(identity);
    if (existing !== undefined && !projectReferencesEqual(existing, reference)) {
      diagnostics.push(projectDiagnostic(
        "CSHARP_PROJECT_REFERENCE_CONFLICT",
        `C# project reference '${reference.include}' has incompatible '${reference.kind}' contracts.`,
        [
          `target.project.reference.kind=${reference.kind}`,
          `target.project.reference.include=${reference.include}`,
        ],
      ));
      continue;
    }
    byIdentity.set(identity, Object.freeze({ ...reference } as CsharpProjectReference));
  }
  return Object.freeze([...byIdentity.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([, reference]) => reference));
}

function projectReferencesEqual(
  left: CsharpProjectReference,
  right: CsharpProjectReference,
): boolean {
  if (left.kind !== right.kind || left.include !== right.include) {
    return false;
  }
  switch (left.kind) {
    case "project":
    case "framework":
      return true;
    case "package": {
      const candidate = right as Extract<CsharpProjectReference, { readonly kind: "package" }>;
      return left.version === candidate.version &&
        left.privateAssets === candidate.privateAssets &&
        left.includeAssets === candidate.includeAssets;
    }
    case "assembly": {
      const candidate = right as Extract<CsharpProjectReference, { readonly kind: "assembly" }>;
      return left.hintPath === candidate.hintPath;
    }
  }
}

function projectDiagnostic(
  code: string,
  message: string,
  evidence: readonly string[],
): TargetDiagnostic {
  return {
    code,
    category: "error",
    source: "tsonic-csharp",
    message,
    evidence: Object.freeze(["target.capability=csharp.project-model", ...evidence]),
  };
}
