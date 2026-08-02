import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ProviderVirtualDeclarationFact,
  ReadonlySourceFactResolver,
} from "@tsonic/tsts";

export type CsharpProviderDeclarationEvidenceResolution =
  | {
      readonly kind: "resolved";
      readonly declaration: ProviderVirtualDeclarationFact;
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
    }
  | {
      readonly kind: "conflict";
      readonly reason: string;
      readonly declarations: readonly ProviderVirtualDeclarationFact[];
    };

export function resolveCsharpProviderDeclarationEvidence(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subjects: readonly (ExtensionFactSubject | undefined)[],
  requiredKind: "export" | "member" | "signature",
): CsharpProviderDeclarationEvidenceResolution {
  if (sourceFacts === undefined) {
    return {
      kind: "missing",
      reason: "The checked source program did not expose source facts.",
    };
  }
  const declarations = uniqueProviderDeclarations(
    subjects
      .map((subject) =>
        sourceFacts.getFact(subject, providerVirtualDeclarationFactKey))
      .filter(
        (declaration): declaration is ProviderVirtualDeclarationFact =>
          declaration !== undefined,
      ),
  );
  if (declarations.length === 0) {
    return {
      kind: "missing",
      reason: "The exact checker-selected source subjects have no provider declaration evidence.",
    };
  }
  if (!providerDeclarationsArePairwiseCompatible(declarations)) {
    return {
      kind: "conflict",
      reason:
        "The exact checker-selected source subjects carry contradictory provider identities.",
      declarations,
    };
  }
  const candidates = declarations.filter((declaration) =>
    providerDeclarationKind(declaration) === requiredKind);
  if (candidates.length === 0) {
    return {
      kind: "missing",
      reason:
        `The selected provider evidence does not contain an exact ${requiredKind} identity.`,
    };
  }
  if (candidates.length > 1) {
    return {
      kind: "conflict",
      reason:
        `The selected source operation has more than one exact provider ${requiredKind} identity.`,
      declarations: candidates,
    };
  }
  return {
    kind: "resolved",
    declaration: candidates[0]!,
  };
}

function providerDeclarationsArePairwiseCompatible(
  declarations: readonly ProviderVirtualDeclarationFact[],
): boolean {
  for (let leftIndex = 0; leftIndex < declarations.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < declarations.length;
      rightIndex += 1
    ) {
      if (
        !providerDeclarationsShareIdentity(
          declarations[leftIndex]!,
          declarations[rightIndex]!,
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

function uniqueProviderDeclarations(
  declarations: readonly ProviderVirtualDeclarationFact[],
): readonly ProviderVirtualDeclarationFact[] {
  const byIdentity = new Map<string, ProviderVirtualDeclarationFact>();
  for (const declaration of declarations) {
    byIdentity.set(providerDeclarationIdentityKey(declaration), declaration);
  }
  return [...byIdentity.values()];
}

function providerDeclarationKind(
  declaration: ProviderVirtualDeclarationFact,
): "export" | "member" | "signature" {
  if (declaration.signatureId !== undefined) {
    return "signature";
  }
  return declaration.memberId === undefined ? "export" : "member";
}

function providerDeclarationsShareIdentity(
  left: ProviderVirtualDeclarationFact,
  right: ProviderVirtualDeclarationFact,
): boolean {
  return left.providerId === right.providerId &&
    left.providerVersion === right.providerVersion &&
    left.providerModuleId === right.providerModuleId &&
    left.moduleSpecifier === right.moduleSpecifier &&
    left.exportId === right.exportId &&
    left.exportName === right.exportName &&
    optionalEqual(left.memberId, right.memberId) &&
    optionalEqual(left.memberStatic, right.memberStatic) &&
    providerMemberKeysCompatible(left.memberKey, right.memberKey) &&
    optionalEqual(left.signatureId, right.signatureId);
}

function providerDeclarationIdentityKey(
  declaration: ProviderVirtualDeclarationFact,
): string {
  return JSON.stringify([
    declaration.providerId,
    declaration.providerVersion,
    declaration.providerModuleId,
    declaration.moduleSpecifier,
    declaration.exportId,
    declaration.exportName,
    declaration.memberId,
    declaration.memberStatic,
    declaration.memberKey?.kind,
    declaration.memberKey?.name,
    declaration.signatureId,
  ]);
}

function optionalEqual<T>(
  left: T | undefined,
  right: T | undefined,
): boolean {
  return left === undefined || right === undefined || left === right;
}

function providerMemberKeysCompatible(
  left: ProviderVirtualDeclarationFact["memberKey"],
  right: ProviderVirtualDeclarationFact["memberKey"],
): boolean {
  return left === undefined ||
    right === undefined ||
    left.kind === right.kind && left.name === right.name;
}

