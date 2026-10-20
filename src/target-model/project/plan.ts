import type {
  CsharpProjectConfiguration,
} from "../configuration/model.js";
import type {
  CsharpProjectProperty,
} from "./model.js";
import type {
  CsharpProjectReference,
} from "./references.js";
import type { CsharpRuntimeProjectInstance, CsharpRuntimeSourceProject } from "./runtime.js";

export interface CsharpProjectClassifications {
  readonly assemblyName: string;
  readonly namespace: string;
  readonly project: CsharpProjectConfiguration;
  readonly properties: readonly CsharpProjectProperty[];
  readonly references: readonly CsharpProjectReference[];
  readonly runtimeSources: readonly CsharpRuntimeSourceProject[];
  readonly runtimeProjects: readonly CsharpRuntimeProjectInstance[];
}
