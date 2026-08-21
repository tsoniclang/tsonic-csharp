import type {
  CsharpProjectReference,
} from "../../../target-model/project/references.js";
import type {
  CsharpProjectProperty,
} from "../../../target-model/project/model.js";

export type { CsharpProjectReference } from "../../../target-model/project/references.js";
export type { CsharpProjectProperty } from "../../../target-model/project/model.js";

export interface CsharpProjectFile {
  readonly sdk: "Microsoft.NET.Sdk";
  readonly path: string;
  readonly properties: readonly CsharpProjectProperty[];
  readonly references: readonly CsharpProjectReference[];
}

export type CsharpProjectPlan =
  | { readonly kind: "generated"; readonly project: CsharpProjectFile }
  | { readonly kind: "user-owned"; readonly projectFile: string };
