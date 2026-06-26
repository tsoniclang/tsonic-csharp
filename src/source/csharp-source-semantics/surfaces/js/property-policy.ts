import type {
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLengthMember,
  getCsharpArrayLikeElementType,
} from "./arrays.js";
import {
  isCsharpBooleanTargetType,
} from "./booleans.js";
import {
  getCollectionPropertyTargetMember,
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "./collections.js";
import {
  isCsharpJsDateRuntimeCarrier,
} from "./date.js";
import {
  getMathPropertyTargetMember,
} from "./math.js";
import {
  getJsonTargetMembers,
} from "./json.js";
import {
  getNumberPropertyTargetMember,
} from "./numbers.js";
import {
  hasObjectTargetMember,
} from "./objects.js";
import {
  getRegExpPropertyTargetMember,
  isCsharpJsRegExpRuntimeCarrier,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryDeclaringName,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpSourcePrimitiveTargetType,
  isSourceLibraryType,
  targetProperty,
} from "./source-library.js";

export function getCsharpJsSourceLibraryMemberFromReceiverType(
  receiverType: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getTypeAtLocation"]>,
  memberName: string,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  if (receiverType === undefined || memberName.length === 0) {
    return undefined;
  }
  const declaringName = propertyReceiverSourceTypeNames.find((sourceName) => isSourceLibraryType(receiverType, context, sourceName));
  return declaringName === undefined ? undefined : { declaringName, memberName };
}

export function csharpJsSourceLibraryPropertyRequiresSeededReceiverFacts(sourceMember: SourceLibraryMember): boolean {
  return seededReceiverFactSourceNames.has(sourceMember.declaringName);
}

export function csharpJsSourceLibraryPropertyRequiresFinalCarrierSelection(sourceMember: SourceLibraryMember): boolean {
  return finalCarrierSelectionSourceNames.has(sourceMember.declaringName);
}

export function csharpJsSourceLibraryPropertyReceiverHasClosedFacts(
  receiverType: TargetTypeRef | undefined,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  return propertyReceiverValidatorsByDeclaringName.get(sourceMember.declaringName)?.(receiverType, sourceMember, host) ?? false;
}

export function getCsharpJsSourceLibraryPropertyMember(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  return propertyMemberResolvers
    .find((resolver) => resolver.matches(sourceMember))
    ?.resolve(sourceMember, receiverType);
}

export type CsharpJsSourceLibraryPropertyPrecheck = "continue" | "defer" | "reject-unmapped";

export function csharpJsSourceLibraryPropertyPrecheck(sourceMember: SourceLibraryMember): CsharpJsSourceLibraryPropertyPrecheck {
  return propertyPrecheckRules
    .find((rule) => rule.matches(sourceMember))
    ?.result(sourceMember) ?? "continue";
}

interface CsharpJsPropertyMemberResolver {
  readonly matches: (sourceMember: SourceLibraryMember) => boolean;
  readonly resolve: (sourceMember: SourceLibraryMember, receiverType: TargetTypeRef | undefined) => TargetMember | undefined;
}

interface CsharpJsPropertyPrecheckRule {
  readonly matches: (sourceMember: SourceLibraryMember) => boolean;
  readonly result: (sourceMember: SourceLibraryMember) => CsharpJsSourceLibraryPropertyPrecheck;
}

const propertyReceiverSourceTypeNames = [
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
] satisfies readonly SourceLibraryDeclaringName[];

const seededReceiverFactSourceNames = new Set<SourceLibraryDeclaringName>([
  "Array",
  "ReadonlyArray",
  "Map",
  "ReadonlyMap",
  "Set",
  "ReadonlySet",
]);

const finalCarrierSelectionSourceNames = new Set<SourceLibraryDeclaringName>([
  "Array",
  "ReadonlyArray",
]);

const propertyReceiverValidatorsByDeclaringName = new Map<SourceLibraryDeclaringName, (
  receiverType: TargetTypeRef | undefined,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
) => boolean>([
  ["Math", () => true],
  ["Array", (receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined],
  ["ReadonlyArray", (receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined],
  ["String", (receiverType, _sourceMember, host) => host.isCsharpStringType(receiverType)],
  ["RegExp", (receiverType) => isCsharpJsRegExpRuntimeCarrier(receiverType)],
  ["Date", (receiverType) => isCsharpJsDateRuntimeCarrier(receiverType)],
  ["Boolean", (receiverType) => isCsharpBooleanTargetType(receiverType)],
  ["Number", (_receiverType, sourceMember) => getNumberPropertyTargetMember(sourceMember.memberName) !== undefined],
  ["Map", (receiverType) => isCsharpJsMapTargetType(receiverType)],
  ["ReadonlyMap", (receiverType) => isCsharpJsMapTargetType(receiverType)],
  ["Set", (receiverType) => isCsharpJsSetTargetType(receiverType)],
  ["ReadonlySet", (receiverType) => isCsharpJsSetTargetType(receiverType)],
]);

const propertyMemberResolvers: readonly CsharpJsPropertyMemberResolver[] = [
  {
    matches: (sourceMember) => sourceMember.memberName !== "length" && sourceMember.declaringName === "Math",
    resolve: (sourceMember) => getMathPropertyTargetMember(sourceMember.memberName),
  },
  {
    matches: (sourceMember) => sourceMember.memberName !== "length" && sourceMember.declaringName === "RegExp",
    resolve: (sourceMember) => getRegExpPropertyTargetMember(sourceMember.memberName),
  },
  {
    matches: (sourceMember) => sourceMember.memberName !== "length" && sourceMember.declaringName === "Number",
    resolve: (sourceMember) => getNumberPropertyTargetMember(sourceMember.memberName),
  },
  {
    matches: (sourceMember) =>
      sourceMember.memberName !== "length" &&
      collectionPropertySourceNames.has(sourceMember.declaringName),
    resolve: getCollectionPropertyTargetMember,
  },
  {
    matches: (sourceMember) => sourceMember.memberName === "length" && sourceMember.declaringName === "String",
    resolve: (sourceMember) => targetProperty(
      `tsonic.csharp.js.${sourceMember.declaringName}.length`,
      sourceMember.memberName,
      "Length",
      csharpSourcePrimitiveTargetType("int32"),
    ),
  },
  {
    matches: (sourceMember) =>
      sourceMember.memberName === "length" &&
      (sourceMember.declaringName === "Array" || sourceMember.declaringName === "ReadonlyArray"),
    resolve: (sourceMember, receiverType) => {
      const lengthMember = receiverType?.kind === "array"
        ? "length"
        : getCsharpArrayLengthMember(receiverType);
      return lengthMember === undefined
        ? undefined
        : targetProperty(
            `tsonic.csharp.js.${sourceMember.declaringName}.length`,
            sourceMember.memberName,
            lengthMember,
            csharpSourcePrimitiveTargetType("int32"),
          );
    },
  },
];

const propertyPrecheckRules: readonly CsharpJsPropertyPrecheckRule[] = [
  {
    matches: (sourceMember) => sourceMember.declaringName === "Console",
    result: () => "defer",
  },
  {
    matches: (sourceMember) => sourceMember.declaringName === "Object",
    result: (sourceMember) => hasObjectTargetMember(sourceMember.memberName) ? "defer" : "reject-unmapped",
  },
  {
    matches: (sourceMember) => sourceMember.declaringName === "JSON",
    result: (sourceMember) => getJsonTargetMembers(sourceMember.memberName).length > 0 ? "defer" : "reject-unmapped",
  },
];

const collectionPropertySourceNames = new Set<SourceLibraryDeclaringName>([
  "Map",
  "ReadonlyMap",
  "Set",
  "ReadonlySet",
]);
