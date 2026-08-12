import {
  tsonicSafetyBuilderFactKey,
  tsonicUnsafeContextFactKey,
} from "@tsonic/source-core";
import type {
  TsonicSafetyBuilderFact,
  TsonicUnsafeContextFact,
} from "@tsonic/source-core";
import type {
  ExtensionFactSubject,
  ReadonlySourceFactResolver,
} from "@tsonic/tsts";
import {
  csharpSafetyBuilderFactKey,
  csharpUnsafeContextFactKey,
} from "../../source/csharp-source-semantics/explicit-safety.js";

export function readCsharpSourceUnsafeContext(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): TsonicUnsafeContextFact | undefined {
  return sourceFacts?.getFact(subject, tsonicUnsafeContextFactKey) ??
    sourceFacts?.getFact(subject, csharpUnsafeContextFactKey);
}

export function readCsharpSourceSafetyBuilder(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): TsonicSafetyBuilderFact | undefined {
  return sourceFacts?.getFact(subject, tsonicSafetyBuilderFactKey) ??
    sourceFacts?.getFact(subject, csharpSafetyBuilderFactKey);
}
