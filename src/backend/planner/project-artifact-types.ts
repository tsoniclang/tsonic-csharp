import type {
  CsharpProjectReference,
} from "../../options/csharp-target-options.js";

export type {
  CsharpProjectReference,
} from "../../options/csharp-target-options.js";

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
