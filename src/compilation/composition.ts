import type {
  TargetProviderDescriptor,
  TargetSurfaceImplementation,
} from "@tsonic/target-api";
import {
  csharpJsSurfaceSourceProfileContributions,
} from "../source/profiles/source-profile-declarations.js";

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
    runtimeContributions() {
      return Object.freeze({});
    },
  }),
]);
