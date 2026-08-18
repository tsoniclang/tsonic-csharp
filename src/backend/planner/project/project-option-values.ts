import type { CsharpPlanningContext } from "../context.js";
import {
  readOptionalBooleanOption as readTargetOptionalBooleanOption,
  readOptionalStringOption as readTargetOptionalStringOption,
  readStringOption as readTargetStringOption,
} from "../../../options/csharp-target-options.js";

export {
  isRecord,
  isScalarPropertyValue,
  isXmlElementName,
  readObjectArrayProperty,
  readOptionalString,
  readRequiredString,
  readStringArrayProperty,
  rejectUnknownKeys,
} from "../../../options/csharp-target-options.js";

export function readStringOption(input: CsharpPlanningContext, key: string, defaultValue: string): string {
  return readTargetStringOption(input.target, key, defaultValue);
}

export function readOptionalStringOption(input: CsharpPlanningContext, key: string): string | undefined {
  return readTargetOptionalStringOption(input.target, key);
}

export function readOptionalBooleanOption(input: CsharpPlanningContext, key: string): boolean | undefined {
  return readTargetOptionalBooleanOption(input.target, key);
}
