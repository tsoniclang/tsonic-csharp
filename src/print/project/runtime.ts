import type { CsharpRuntimeProjectInstance } from "../../target-model/project/runtime.js";

export function printCsharpRuntimeProject(project: CsharpRuntimeProjectInstance): string {
  return [
    "<Project>",
    "  <PropertyGroup>",
    `    <TargetFramework>${xmlValue(project.framework)}</TargetFramework>`,
    `    <DirectoryBuildPropsPath>${pathValue(project.sourceProperties)}</DirectoryBuildPropsPath>`,
    "    <TsonicRuntimeArtifactsPath>$(MSBuildThisFileDirectory)artifacts/</TsonicRuntimeArtifactsPath>",
    ...Object.entries(project.dependencies).map(([name, path]) => `    <${name}>${pathValue(path)}</${name}>`),
    "  </PropertyGroup>",
    `  <Import Project="${pathValue(project.sourceProject)}" />`,
    "</Project>",
    "",
  ].join("\n");
}

function pathValue(value: string): string {
  return xmlValue(value.replace(/[%$@();'?*]/gu, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`));
}

function xmlValue(value: string): string {
  const entities: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return value.replace(/[&<>"']/gu, character => entities[character]!);
}
