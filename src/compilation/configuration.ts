import type { TargetSelection } from "@tsonic/target-api";
import type { CsharpTargetConfiguration } from "../target-model/configuration/model.js";
import { readOptionalStringOption, readOptionalBooleanOption, readCsharpLanguageDialect, readCsharpMemorySafetyRules, readCsharpReferences, readCsharpTargetFramework, readCsharpOutputType, readCsharpUserProjectFile, readCsharpProperties, readCsharpProviderReferences, validateCsharpTargetOptionKeys, validateCsharpSafetyConfiguration } from "../options/target.js";
import { resolveCsharpProjectConfiguration } from "../options/user-project.js";
import { resolveCsharpReflectionReferencePaths } from "../providers/native/acquisition/reference-paths.js";

export function createCsharpTargetConfiguration(
  target: TargetSelection,
  projectDirectory: string,
  targetOutputRoot: string,
): CsharpTargetConfiguration {
  validateCsharpTargetOptionKeys(target);
  const languageDialect = readCsharpLanguageDialect(target);
  const memorySafetyRules = readCsharpMemorySafetyRules(target);
  const references = readCsharpReferences(target);
  const targetFramework = readCsharpTargetFramework(target);
  validateCsharpSafetyConfiguration(languageDialect, memorySafetyRules);
  return Object.freeze({
    assemblyName: readOptionalStringOption(target, "assemblyName"),
    implicitUsings: readOptionalBooleanOption(target, "implicitUsings"),
    languageDialect,
    memorySafetyRules,
    namespace: readOptionalStringOption(target, "namespace"),
    nullable: readOptionalBooleanOption(target, "nullable"),
    outputType: readCsharpOutputType(target),
    project: resolveCsharpProjectConfiguration(
      readCsharpUserProjectFile(target),
      projectDirectory,
      targetOutputRoot,
    ),
    properties: readCsharpProperties(target),
    publishAot: readOptionalBooleanOption(target, "publishAot"),
    references: Object.freeze(
      references.map((reference) => Object.freeze(reference)),
    ),
    reflectionReferencePaths: Object.freeze(
      resolveCsharpReflectionReferencePaths(
        references,
        readCsharpProviderReferences(target),
        targetFramework,
        projectDirectory,
      ),
    ),
    targetFramework,
  });
}
