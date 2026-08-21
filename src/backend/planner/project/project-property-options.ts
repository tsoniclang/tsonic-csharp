import type { CsharpPlanningContext } from "../context.js";
import type {
  CsharpProjectProperty,
} from "../../artifact-model/project/model.js";

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

export function readCsharpProjectProperties(
  input: CsharpPlanningContext,
  options: { readonly allowUnsafeBlocks?: boolean },
): readonly CsharpProjectProperty[] {
  const configuration = input.program.configuration;
  const properties = new Map<string, string>();
  properties.set("TargetFramework", configuration.targetFramework);
  properties.set("Nullable", configuration.nullable === false ? "disable" : "enable");
  properties.set("ImplicitUsings", configuration.implicitUsings === true ? "enable" : "disable");
  properties.set(
    "LangVersion",
    configuration.languageDialect === "csharp14"
      ? "14.0"
      : "preview",
  );
  properties.set("OutputType", configuration.outputType);
  if (configuration.memorySafetyRules === "preview") {
    properties.set("Features", "updated-memory-safety-rules");
  }
  if (options.allowUnsafeBlocks === true) {
    properties.set("AllowUnsafeBlocks", "true");
  }
  const publishAot = configuration.publishAot;
  if (publishAot !== undefined) {
    properties.set("PublishAot", publishAot ? "true" : "false");
  }
  for (const [name, value] of Object.entries(configuration.properties)) {
      if (targetOwnedProjectProperties.has(name)) {
        throw new Error(`C# target property '${name}' is target-owned and must be configured through the dedicated target option.`);
      }
      properties.set(name, String(value));
  }
  return [...properties.entries()].map(([name, value]) => ({ name, value }));
}
