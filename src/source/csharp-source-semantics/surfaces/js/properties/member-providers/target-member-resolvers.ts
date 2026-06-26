import {
  getCsharpArrayLengthMember,
} from "../../arrays.js";
import {
  getCollectionPropertyTargetMember,
} from "../../collections.js";
import {
  mathPropertyTargetMemberForSourceName,
} from "../../math.js";
import {
  numberPropertyTargetMemberForSourceName,
} from "../../numbers.js";
import {
  regExpPropertyTargetMemberForSourceName,
} from "../../regexp/index.js";
import {
  csharpSourcePrimitiveTargetType,
  sourceLibraryMemberIdSet,
  sourceLibraryMemberIdentity,
  sourceLibraryMemberName,
} from "../../source-library.js";
import {
  jsSurfaceTargetMemberFromMetadata,
} from "../../target-member-metadata.js";
import type {
  CsharpJsPropertyMemberResolver,
} from "./types.js";

export const propertyMemberResolvers: readonly CsharpJsPropertyMemberResolver[] = [
  {
    identity: { prefixes: ["Math."] },
    excludedIdentity: { ids: sourceLibraryMemberIdSet(["Math.length"]) },
    resolve: (sourceMember) => mathPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)),
  },
  {
    identity: { prefixes: ["RegExp."] },
    excludedIdentity: { ids: sourceLibraryMemberIdSet(["RegExp.length"]) },
    resolve: (sourceMember) => regExpPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)),
  },
  {
    identity: { prefixes: ["Number."] },
    excludedIdentity: { ids: sourceLibraryMemberIdSet(["Number.length"]) },
    resolve: (sourceMember) => numberPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)),
  },
  {
    identity: { prefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."] },
    excludedIdentity: { ids: sourceLibraryMemberIdSet(["Map.length", "ReadonlyMap.length", "Set.length", "ReadonlySet.length"]) },
    resolve: getCollectionPropertyTargetMember,
  },
  {
    identity: { ids: sourceLibraryMemberIdSet(["String.length"]) },
    resolve: (sourceMember) => jsSurfaceTargetMemberFromMetadata({
      id: "tsonic.csharp.js.String.length",
      sourceName: sourceLibraryMemberName(sourceMember),
      targetName: "Length",
      kind: "property",
      returnType: csharpSourcePrimitiveTargetType("int32"),
    }),
  },
  {
    identity: { ids: sourceLibraryMemberIdSet(["Array.length", "ReadonlyArray.length"]) },
    resolve: (sourceMember, receiverType) => {
      const lengthMember = receiverType?.kind === "array"
        ? "length"
        : getCsharpArrayLengthMember(receiverType);
      return lengthMember === undefined
        ? undefined
        : jsSurfaceTargetMemberFromMetadata({
            id: `tsonic.csharp.js.${sourceLibraryMemberIdentity(sourceMember)}`,
            sourceName: sourceLibraryMemberName(sourceMember),
            targetName: lengthMember,
            kind: "property",
            returnType: csharpSourcePrimitiveTargetType("int32"),
          });
    },
  },
];
