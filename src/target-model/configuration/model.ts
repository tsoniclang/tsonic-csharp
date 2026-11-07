import type { CsharpProjectReference } from "../project/references.js";
import type { CsharpPlatformSelection } from "./platform.js";

export type CsharpOutputType = "Exe" | "Library";
export type CsharpLanguageDialect = "csharp14" | "csharp15-preview";
export type CsharpMemorySafetyRules = "csharp14" | "preview";

export type CsharpProjectConfiguration =
  | { readonly kind: "generated" }
  | { readonly kind: "user-owned"; readonly projectFile: string };

export interface CsharpTargetConfiguration {
  readonly assemblyName?: string;
  readonly implicitUsings?: boolean;
  readonly languageDialect: CsharpLanguageDialect;
  readonly memorySafetyRules: CsharpMemorySafetyRules;
  readonly namespace?: string;
  readonly nullable?: boolean;
  readonly outputType: CsharpOutputType;
  /** The build's architecture statement and its native integer premise (E24, N5; platform.ts). */
  readonly platform: CsharpPlatformSelection;
  readonly project: CsharpProjectConfiguration;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
  readonly publishAot?: boolean;
  readonly references: readonly CsharpProjectReference[];
  readonly reflectionReferencePaths: readonly string[];
  readonly targetFramework: string;
}
