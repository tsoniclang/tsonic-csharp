import type { CsharpProjectFile, CsharpProjectReference } from "../../backend/project-model/csharp-project.js";

export function printCsharpProjectFile(project: CsharpProjectFile): string {
  return [
    `<Project Sdk="${escapeXml(project.sdk)}">`,
    "  <PropertyGroup>",
    ...project.properties.map((property) => `    <${property.name}>${escapeXml(property.value)}</${property.name}>`),
    "  </PropertyGroup>",
    ...projectItemGroups(project.references),
    "</Project>",
    "",
  ].join("\n");
}

function projectItemGroups(references: readonly CsharpProjectReference[]): readonly string[] {
  if (references.length === 0) {
    return [];
  }
  return [
    "  <ItemGroup>",
    ...references.map(formatReferenceItem),
    "  </ItemGroup>",
  ];
}

function formatReferenceItem(reference: CsharpProjectReference): string {
  switch (reference.kind) {
    case "project":
      return `    <ProjectReference Include="${escapeXml(reference.include)}" />`;
    case "package":
      return formatXmlItem("PackageReference", {
        Include: reference.include,
        Version: reference.version,
        PrivateAssets: reference.privateAssets,
        IncludeAssets: reference.includeAssets,
      });
    case "framework":
      return `    <FrameworkReference Include="${escapeXml(reference.include)}" />`;
    case "assembly":
      return formatXmlItem("Reference", {
        Include: reference.include,
        HintPath: reference.hintPath,
      });
  }
}

function formatXmlItem(name: string, attributes: Readonly<Record<string, string | undefined>>): string {
  const renderedAttributes = Object.entries(attributes)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}="${escapeXml(value)}"`)
    .join(" ");
  return `    <${name} ${renderedAttributes} />`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
