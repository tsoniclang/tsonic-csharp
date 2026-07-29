import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  readOptionalBooleanOption as readTargetOptionalBooleanOption,
  readOptionalStringOption as readTargetOptionalStringOption,
  readStringOption as readTargetStringOption,
} from "../../options/csharp-target-options.js";

export {
  isRecord,
  isScalarPropertyValue,
  isXmlElementName,
  readObjectArrayProperty,
  readOptionalString,
  readRequiredString,
  readStringArrayProperty,
  rejectUnknownKeys,
} from "../../options/csharp-target-options.js";

export function readStringOption(input: CsharpTranslationContext, key: string, defaultValue: string): string {
  return readTargetStringOption(input.target, key, defaultValue);
}

export function readOptionalStringOption(input: CsharpTranslationContext, key: string): string | undefined {
  return readTargetOptionalStringOption(input.target, key);
}

export function readOptionalBooleanOption(input: CsharpTranslationContext, key: string): boolean | undefined {
  return readTargetOptionalBooleanOption(input.target, key);
}
