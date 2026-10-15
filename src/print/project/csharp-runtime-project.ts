import type { CsharpRuntimeProjectInstance } from "../../backend/artifact-model/project/runtime.js";
import { escapeXml } from "./csharp-project.js";

export function printCsharpRuntimeProject(project: CsharpRuntimeProjectInstance): string {
  return [
    "<Project>",
    "  <PropertyGroup>",
    `    <TargetFramework>${escapeXml(project.framework)}</TargetFramework>`,
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
  return escapeXml(value.replace(/[%$@();'?*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`));
}
