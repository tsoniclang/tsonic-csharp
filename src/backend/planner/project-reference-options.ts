import type { TargetCompileInput } from "@tsonic/target-api";
import {
  readCsharpReferences,
} from "../../options/csharp-target-options.js";
import type {
  CsharpProjectReference,
} from "./project-artifact-types.js";

export function readReferencesOption(input: TargetCompileInput): readonly CsharpProjectReference[] {
  return readCsharpReferences(input.target);
}
