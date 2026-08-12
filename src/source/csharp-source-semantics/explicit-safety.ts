import {
  defineExtensionFactKey,
} from "@tsonic/tsts";
import type {
  Node,
} from "@tsonic/tsts";
import type {
  SourceSafetyProviderNames,
  TsonicSafetyBuilderFact,
  TsonicUnsafeContextFact,
} from "@tsonic/source-core";
import {
  csharpLangModule,
  csharpSourceSemanticsExtensionId,
} from "./identity.js";

export const csharpSafetyProviderNames: SourceSafetyProviderNames =
  Object.freeze({
    moduleSpecifier: csharpLangModule,
    unsafeContextExport: "unsafe",
    safetyExport: "safety",
    safetyBuilderExport: "__TsonicCsharpSafetyBuilder",
    safetyMemberBuilderExport: "__TsonicCsharpSafetyMemberBuilder",
  });

export const csharpNativePointerExport = "ptr";

export const csharpUnsafeContextFactKey =
  defineExtensionFactKey<TsonicUnsafeContextFact>({
    extensionId: csharpSourceSemanticsExtensionId,
    name: "unsafeContext",
    snapshot: (value) => Object.freeze({ ...value }),
    equals: (left, right) => left.kind === right.kind &&
      (left.kind !== "expression" || right.kind !== "expression" ||
        left.expression === right.expression),
  });

export const csharpSafetyBuilderFactKey =
  defineExtensionFactKey<TsonicSafetyBuilderFact>({
    extensionId: csharpSourceSemanticsExtensionId,
    name: "safetyBuilderApplication",
    snapshot: snapshotSafetyBuilderFact,
    equals: (left, right) => left.kind === right.kind &&
      left.applicationTarget === right.applicationTarget &&
      left.selectedMember === right.selectedMember &&
      left.selectedMemberDeclaration === right.selectedMemberDeclaration &&
      sourceNodesEqual(
        left.selectedMemberDeclarations,
        right.selectedMemberDeclarations,
      ) &&
      left.applicationMemberKind === right.applicationMemberKind &&
      left.applicationPlacement === right.applicationPlacement &&
      (left.kind !== "application" || right.kind !== "application" ||
        left.contract === right.contract),
  });

function snapshotSafetyBuilderFact(
  value: TsonicSafetyBuilderFact,
): TsonicSafetyBuilderFact {
  return Object.freeze({
    ...value,
    ...(value.selectedMemberDeclarations === undefined
      ? {}
      : {
          selectedMemberDeclarations: Object.freeze([
            ...value.selectedMemberDeclarations,
          ]),
        }),
  });
}

function sourceNodesEqual(
  left: readonly Node[] | undefined,
  right: readonly Node[] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  return left !== undefined && right !== undefined &&
    left.length === right.length &&
    left.every((node, index) => node === right[index]);
}
