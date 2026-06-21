export interface CsharpProjectFile {
  readonly sdk: "Microsoft.NET.Sdk";
  readonly path: string;
  readonly properties: readonly CsharpProjectProperty[];
  readonly references: readonly CsharpProjectReference[];
}

export interface CsharpProjectProperty {
  readonly name: string;
  readonly value: string;
}

export type CsharpProjectReference =
  | { readonly kind: "project"; readonly include: string }
  | { readonly kind: "package"; readonly include: string; readonly version?: string; readonly privateAssets?: string; readonly includeAssets?: string }
  | { readonly kind: "framework"; readonly include: string }
  | { readonly kind: "assembly"; readonly include: string; readonly hintPath?: string };
