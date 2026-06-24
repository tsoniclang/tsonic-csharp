import type { TargetCompileInput } from "@tsonic/target-api";
import type {
  CsharpProjectProperty,
} from "./project-artifact-types.js";
import {
  isRecord,
  isScalarPropertyValue,
  isXmlElementName,
  readOptionalBooleanOption,
  readStringOption,
} from "./project-option-values.js";
import {
  readCsharpOutputType,
  readCsharpTargetFramework,
} from "../../options/csharp-target-options.js";

const targetOwnedProjectProperties = new Set([
  "AllowUnsafeBlocks",
  "ImplicitUsings",
  "Nullable",
  "OutputType",
  "PublishAot",
  "TargetFramework",
]);

export function readCsharpProjectProperties(
  input: TargetCompileInput,
  options: { readonly allowUnsafeBlocks?: boolean },
): readonly CsharpProjectProperty[] {
  const properties = new Map<string, string>();
  properties.set("TargetFramework", readCsharpTargetFramework(input.target));
  properties.set("Nullable", readStringOption(input, "nullable", "enable"));
  properties.set("ImplicitUsings", readStringOption(input, "implicitUsings", "disable"));
  properties.set("OutputType", readCsharpOutputType(input.target));
  if (options.allowUnsafeBlocks === true) {
    properties.set("AllowUnsafeBlocks", "true");
  }
  const publishAot = readOptionalBooleanOption(input, "publishAot");
  if (publishAot !== undefined) {
    properties.set("PublishAot", publishAot ? "true" : "false");
  }
  const customProperties = input.target.options?.properties;
  if (customProperties !== undefined) {
    if (!isRecord(customProperties)) {
      throw new Error("C# target option 'properties' must be an object.");
    }
    for (const [name, value] of Object.entries(customProperties)) {
      if (!isXmlElementName(name)) {
        throw new Error(`C# target property '${name}' is not a valid XML element name.`);
      }
      if (targetOwnedProjectProperties.has(name)) {
        throw new Error(`C# target property '${name}' is target-owned and must be configured through the dedicated target option.`);
      }
      if (!isScalarPropertyValue(value)) {
        throw new Error(`C# target property '${name}' must be a string, number, or boolean.`);
      }
      properties.set(name, String(value));
    }
  }
  return [...properties.entries()].map(([name, value]) => ({ name, value }));
}
