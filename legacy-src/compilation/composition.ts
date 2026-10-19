import type {
  TargetProviderDescriptor,
  TargetSurfaceImplementation,
} from "@tsonic/target-api";
import type {
  TargetRuntimeContributions,
} from "@tsonic/target-api/artifacts";
import {
  csharpJsSurfaceSourceProfileContributions,
} from "../source/profiles/source-profile-declarations.js";
import {
  createJsSourceSemanticsExtension,
  jsSourceSemanticsModules,
} from "@tsonic/js-source-profile";
import { csharpJsRuntimeSource, csharpRuntimeSourceContributions } from "../providers/runtime/source-projects.js";

export const csharpTargetProvider: TargetProviderDescriptor = Object.freeze({
  id: "csharp-provider",
  displayName: "C# target provider",
  moduleOwnership: Object.freeze([
    Object.freeze({ specifierPrefix: "@tsonic/csharp/" }),
    Object.freeze({ specifierPrefix: "@tsonic/dotnet/" }),
  ]),
});

export const csharpTargetSurfaces: readonly TargetSurfaceImplementation[] = Object.freeze([
  Object.freeze({
    id: "js",
    displayName: "JavaScript surface",
    sourceProfileContributions: csharpJsSurfaceSourceProfileContributions,
    sourceCompilerContributions() {
      return Object.freeze({
        semanticsModules: jsSourceSemanticsModules(),
        extensions: Object.freeze([createJsSourceSemanticsExtension()]),
      });
    },
    runtimeContributions(): TargetRuntimeContributions {
      return csharpRuntimeSourceContributions(csharpJsRuntimeSource);
    },
  }),
]);
