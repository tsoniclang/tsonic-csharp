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
  csharpJsSourceProfileOwnerId,
  csharpSourceProfileContributions,
} from "../source/profiles/source-profile-declarations.js";
import { csharpRuntimeAssemblyReference } from "./runtime-references.js";
import {
  csharpJsEventLoopBinaryEpilogue,
} from "../providers/builtins/binary-epilogues.js";
import {
  composeCsharpBinaryEpilogues,
} from "../providers/model/provider-policy-contribution.js";

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
  const jsEnabled = context.selectedSurfaceIds.includes(
    csharpJsSourceProfileOwnerId,
  );
  const binaryEpilogues = composeCsharpBinaryEpilogues(
    capabilityContributions.binaryEpilogues,
    jsEnabled ? [csharpJsEventLoopBinaryEpilogue] : [],
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
          csharpRuntimeAssemblyReference(
            context,
            "@tsonic/csharp-runtime",
            "Tsonic.CSharp.Runtime",
          ),
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
        binaryEpilogues,
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

function requireState(
  actual: CsharpCompilationSessionState,
  expected: CsharpCompilationSessionState,
  operation: string,
): void {
  if (actual !== expected) {
    throw new Error(`C# compilation session cannot call '${operation}' while in '${actual}' state; expected '${expected}'.`);
  }
}
