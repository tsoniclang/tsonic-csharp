import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type {
  TargetCompilationSession,
  TargetCompilationSessionContext,
  TargetCompileInput,
  TargetSourceCompilerContributions,
  TargetSourceProfileContributions,
} from "@tsonic/target-api";
import type {
  TargetCompileResult,
  TargetRuntimeContributions,
  TargetRuntimeReference,
} from "@tsonic/target-api/artifacts";
import {
  createDotnetReflectionTypeDataProvider,
  createDotnetSourceDeclarationProviderSet,
  dotnetModuleSpecifierPolicy,
} from "../providers/dotnet/index.js";
import {
  collectCsharpCapabilityContributions,
  createCapabilityDotnetProviders,
} from "../providers/dotnet/contributions.js";
import {
  createCsharpProviderRelationResolver,
} from "../providers/relations/resolver.js";
import { compileCsharpTarget } from "../backend/compile.js";
import {
  createCsharpTargetConfiguration,
} from "../options/csharp-target-options.js";
import {
  createCsharpSourceSemanticsExtension,
} from "../source/extension/csharp-source-semantics-extension.js";
import {
  csharpSourceSemanticsModules,
} from "../source/profiles/source-modules.js";
import {
  csharpSourceProfileContributions,
} from "../source/profiles/source-profile-declarations.js";

const require = createRequire(import.meta.url);

type CsharpCompilationSessionState =
  | "created"
  | "profile-contributed"
  | "compiler-contributed"
  | "runtime-contributed"
  | "compiled"
  | "closed";

export function createCsharpCompilationSession(
  context: TargetCompilationSessionContext,
): TargetCompilationSession {
  const configuration = createCsharpTargetConfiguration(
    context.target,
    context.projectDirectory,
    context.paths.targetOutputRoot,
  );
  const capabilityContributions = collectCsharpCapabilityContributions(
    context.capabilities,
  );
  const builtInProvider = createDotnetReflectionTypeDataProvider({
    references: configuration.reflectionReferencePaths,
    targetFramework: configuration.targetFramework,
  });
  const capabilityProviders = createCapabilityDotnetProviders(
    capabilityContributions,
  );
  const providers = Object.freeze([
    builtInProvider,
    ...capabilityProviders.map((entry) => entry.provider),
  ]);
  const sourceDeclarationProviders = createDotnetSourceDeclarationProviderSet([
    {
      provider: builtInProvider,
      moduleSpecifierPolicy: dotnetModuleSpecifierPolicy,
      targetFramework: configuration.targetFramework,
    },
    ...capabilityProviders.map((entry) => ({
      provider: entry.provider,
      moduleSpecifierPolicy: entry.moduleSpecifierPolicy,
      ...(entry.targetFramework === undefined
        ? {}
        : { targetFramework: entry.targetFramework }),
    })),
  ]);
  const relationResolver = createCsharpProviderRelationResolver({
    providers,
    providerPolicies: capabilityContributions.providerPolicies,
  });
  let state: CsharpCompilationSessionState = "created";
  return Object.freeze({
    sourceProfileContributions(): TargetSourceProfileContributions {
      requireState(state, "created", "sourceProfileContributions");
      state = "profile-contributed";
      return csharpSourceProfileContributions(context);
    },
    sourceCompilerContributions(): TargetSourceCompilerContributions {
      requireState(state, "profile-contributed", "sourceCompilerContributions");
      state = "compiler-contributed";
      return Object.freeze({
        semanticsModules: csharpSourceSemanticsModules(),
        extensions: Object.freeze([
          createCsharpSourceSemanticsExtension(sourceDeclarationProviders),
        ]),
      });
    },
    runtimeContributions(): TargetRuntimeContributions {
      requireState(state, "compiler-contributed", "runtimeContributions");
      state = "runtime-contributed";
      return Object.freeze({
        references: Object.freeze([
          runtimeAssemblyReference(context, "@tsonic/csharp-runtime", "Tsonic.CSharp.Runtime"),
          runtimeAssemblyReference(context, "@tsonic/csharp-js", "Tsonic.CSharp.Js"),
        ]),
      });
    },
    compile(input: TargetCompileInput): TargetCompileResult {
      requireState(state, "runtime-contributed", "compile");
      state = "compiled";
      return compileCsharpTarget(Object.freeze({
        input,
        configuration,
        providers: relationResolver,
      }));
    },
    close(): void {
      if (state === "closed") {
        return;
      }
      state = "closed";
    },
  });
}

function runtimeAssemblyReference(
  context: TargetCompilationSessionContext,
  packageName: string,
  assemblyName: string,
): TargetRuntimeReference {
  const packageRoot = resolveRuntimePackageRoot(context, packageName);
  return Object.freeze({
    kind: "assembly",
    include: assemblyName,
    attributes: Object.freeze({
      HintPath: resolve(packageRoot, `runtimes/net10.0/${assemblyName}.dll`),
    }),
  });
}

function resolveRuntimePackageRoot(
  context: TargetCompilationSessionContext,
  packageName: string,
): string {
  const packageJsonSpecifier = `${packageName}/package.json`;
  const projectRequire = createRequire(resolve(context.paths.projectRoot, "package.json"));
  for (const resolver of [projectRequire, require]) {
    try {
      return dirname(resolver.resolve(packageJsonSpecifier));
    } catch {
      continue;
    }
  }
  throw new Error(`Required C# runtime package '${packageName}' is not installed or does not export package.json.`);
}

function requireState(
  actual: CsharpCompilationSessionState,
  expected: CsharpCompilationSessionState,
  operation: string,
): void {
  if (actual !== expected) {
    throw new Error(`C# compilation session cannot call '${operation}' while in '${actual}' state; expected '${expected}'.`);
  }
}
