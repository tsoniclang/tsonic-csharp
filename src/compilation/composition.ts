import type {
  TargetProviderDescriptor,
  TargetSurfaceImplementation,
} from "@tsonic/target-api";
import type {
  TargetRuntimeContributionContext,
} from "@tsonic/target-api/provider";
import type {
  TargetRuntimeContributions,
} from "@tsonic/target-api/artifacts";
import {
  csharpJsSurfaceSourceProfileContributions,
} from "../source/profiles/source-profile-declarations.js";
import { csharpRuntimeAssemblyReference } from "./runtime-references.js";

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
      return Object.freeze({});
    },
    runtimeContributions(
      context: TargetRuntimeContributionContext,
    ): TargetRuntimeContributions {
      return Object.freeze({
        references: Object.freeze([
          csharpRuntimeAssemblyReference(
            context,
            "@tsonic/csharp-js",
            "Tsonic.CSharp.Js",
          ),
        ]),
      });
    },
  }),
]);
