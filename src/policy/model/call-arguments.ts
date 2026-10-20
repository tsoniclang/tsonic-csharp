import type { CsharpTargetParameter } from "../../target-model/types/model.js";

export interface CsharpPositionalArgumentsInput {
  readonly indexes: readonly number[];
  readonly parameters: readonly CsharpTargetParameter[];
}
