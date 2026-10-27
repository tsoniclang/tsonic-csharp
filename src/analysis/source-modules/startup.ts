import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpSourceFileRecords } from "../../target-model/records/program/source-files.js";
import type { CsharpModuleInitializationIndex } from "../../target-model/records/program/module-initialization.js";
import type { CsharpSourceModuleConstructionIndex } from "../../target-model/records/program/source-modules.js";
import type { CsharpStartupEmission } from "../../target-model/records/program/startup.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../target-model/metadata/provider-metadata.js";
import type { CsharpTargetConfiguration } from "../../target-model/configuration/model.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpStartupRecords } from "../program/records/program/startup.js";

export function analyzeCsharpStartup(input: {
  readonly source: TargetSourceProgram;
  readonly identities: CsharpSourceFileRecords;
  readonly modules: CsharpModuleInitializationIndex;
  readonly constructions: CsharpSourceModuleConstructionIndex;
  readonly outputType: CsharpTargetConfiguration["outputType"];
  readonly driver: CsharpTargetBinaryExecutionDriver | undefined;
}) {
  const issues: TargetDiagnostic[] = [];
  const entry = input.modules.entrypointInitializer();
  const hasEntry = entry !== undefined && input.modules.requiresModuleInitializer.get(entry);
  const asynchronousEntry = hasEntry && input.modules.asyncModuleInitializer.get(entry!);
  const library = input.outputType === "Library";
  const workers = new Map<string, CsharpStartupEmission["workers"][number]>();
  if (library && asynchronousEntry) issues.push(Object.freeze({ code: "CSHARP_ASYNC_LIBRARY_MODULE_INITIALIZATION_UNSUPPORTED",
    source: "tsonic-csharp", category: "error", sourceNode: entry,
    message: "C# library output cannot preserve TypeScript top-level await during automatic module initialization because CLR module initializers must be synchronous.",
    evidence: Object.freeze(["The configured library entry module requires asynchronous initialization.",
      "Generated library members can execute only after the complete entry-module dependency graph has initialized.",
      "Select executable output or remove top-level await from the library module graph."]) }));
  if (!library) {
    if (input.driver !== undefined && !selectCsharpTypeEmission({ carrier: input.driver.declaringType }))
      issues.push(Object.freeze({ code: "CSHARP_BINARY_EXECUTION_DRIVER_TYPE_UNRENDERABLE", source: "tsonic-csharp", category: "error",
        message: `Provider binary execution driver '${input.driver.id}' has no renderable C# declaring type.`,
        evidence: Object.freeze([`provider.binaryExecutionDriver=${input.driver.id}`, `provider.runMethod=${input.driver.runMethodName}`,
          `provider.runWithEntrypointMethod=${input.driver.runWithEntrypointMethodName}`]) }));
    const checkedFiles = new Set(input.source.sourceFiles);
    for (const construction of input.constructions.entries()) {
      const file = construction.targetSourceFile;
      const fileName = input.source.ast.getFileName(file);
      const identity = input.identities.sourceFile.get(fileName);
      if (!checkedFiles.has(file) || identity === undefined || file.IsDeclarationFile || input.identities.providerSourceFile.get(file)) {
        issues.push(Object.freeze({ code: "CSHARP_WORKER_SOURCE_ARTIFACT_MISSING", source: "tsonic-csharp", category: "error", sourceNode: file,
          message: `Worker source module '${fileName}' has no planned C# source artifact.` }));
        continue;
      }
      const key = `${construction.bootstrap.id}\0${fileName}`;
      if (workers.has(key)) continue;
      if (!selectCsharpTypeEmission({ carrier: construction.bootstrap.declaringType })) {
        issues.push(Object.freeze({ code: "CSHARP_WORKER_BOOTSTRAP_TYPE_UNRENDERABLE", source: "tsonic-csharp", category: "error", sourceNode: file,
          message: `Source-module bootstrap '${construction.bootstrap.id}' has no renderable C# declaring type.` }));
        continue;
      }
      workers.set(key, Object.freeze({ sourceFile: file, fileName, identity: identity.className, bootstrap: construction.bootstrap }));
    }
  }
  return Object.freeze({ issues: Object.freeze(issues), records: createCsharpStartupRecords({
    kind: library ? hasEntry ? "library" : "none" : "binary",
    entryFileName: entry === undefined ? undefined : input.source.ast.getFileName(entry),
    driver: library ? undefined : input.driver, workers: Object.freeze([...workers.values()]),
    asynchronous: !library && input.driver === undefined && (asynchronousEntry || [...workers.values()].some(worker =>
      input.modules.asyncModuleInitializer.get(worker.sourceFile))),
  }) });
}
