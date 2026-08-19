import { tsonicNativePointerOperationFactKey } from "@tsonic/source-core/facts";
import type { TsonicNativePointerOperationFact } from "@tsonic/source-core/facts";
import type {
  ExtensionFactSubject,
  ReadonlySourceFactResolver,
} from "@tsonic/tsts";

export type CsharpSourceNativePointerOperation =
  TsonicNativePointerOperationFact;

export function readCsharpSourceNativePointerOperation(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceNativePointerOperation | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const operation = sourceFacts?.getFact(
    subject,
    tsonicNativePointerOperationFactKey,
  );
  return operation;
}
