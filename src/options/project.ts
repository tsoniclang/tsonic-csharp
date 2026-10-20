import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetConfiguration } from "../target-model/configuration/model.js";
import { sanitizeIdentifier } from "../target-model/names/identifiers.js";
import type { CsharpProjectProperty } from "../target-model/project/model.js";
import type { CsharpProjectReference } from "../target-model/project/references.js";

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

export function csharpAssemblyName(
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

export function csharpNamespace(
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

export function csharpProjectProperties(
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

export function canonicalProjectReferences(
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

export function projectDiagnostic(
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
