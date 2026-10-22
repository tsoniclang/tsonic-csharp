// The C# analysis takes the compilation session's project classification and provider runtime acquisition. Tests that
// call analyzeCsharpTargetProgram directly complete their request the way the session's compile() does.
import { classifyCsharpProjectConfiguration } from "../../dist/compilation/project.js";
import { printCsharpRuntimeProject } from "../../dist/print/project/runtime.js";

export function completeCsharpAnalysisRequest(request) {
  const cacheRoot = request.input.paths.cacheRoot;
  const project = classifyCsharpProjectConfiguration(request.configuration, request.input.runtimeReferences ?? [], cacheRoot);
  if (project.kind === "rejected") throw new Error(project.diagnostics.map(diagnostic => diagnostic.message).join("\n"));
  const providerAcquisition = request.providers.prepareRuntimeSources({
    sources: project.value.runtimeSources,
    projects: project.value.runtimeProjects.map(runtime => ({ ...runtime, text: printCsharpRuntimeProject(runtime) })),
    project: request.configuration.project,
    properties: project.value.properties,
    cacheRoot,
  });
  return { ...request, project: project.value, providerAcquisition };
}
