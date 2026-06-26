import type {
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
} from "../source-library.js";
import {
  createSourceLibraryMember,
} from "../source-library.js";
import {
  getSourceStandardLibraryDeclaringNameForType,
} from "../../../source-type-classification.js";

export function getCsharpJsSourceLibraryMemberFromReceiverType(
  receiverType: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getTypeAtLocation"]>,
  memberName: string,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  if (receiverType === undefined || memberName.length === 0) {
    return undefined;
  }
  const declaringName = getSourceStandardLibraryDeclaringNameForType(receiverType, context);
  return declaringName === undefined || !propertyReceiverSourceTypeNames.has(declaringName)
    ? undefined
    : createSourceLibraryMember(declaringName, memberName);
}

const propertyReceiverSourceTypeNames = new Set<string>([
  "Array",
  "ReadonlyArray",
  "String",
  "Boolean",
  "RegExp",
  "Date",
  "Map",
  "ReadonlyMap",
  "Set",
  "ReadonlySet",
]);
