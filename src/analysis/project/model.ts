import type {
  CsharpProjectConfiguration,
} from "../../target-model/configuration/model.js";
import type {
  CsharpProjectProperty,
} from "../../target-model/project/model.js";
import type {
  CsharpProjectReference,
} from "../../target-model/project/references.js";

export interface CsharpProjectClassifications {
  readonly assemblyName: string;
  readonly namespace: string;
  readonly project: CsharpProjectConfiguration;
  readonly properties: readonly CsharpProjectProperty[];
  readonly references: readonly CsharpProjectReference[];
}
