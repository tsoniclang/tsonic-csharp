import type { Node, ProviderVirtualDeclarationFact } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";

export type CsharpProviderDeclarationEvidenceResolution =
  | {
      readonly kind: "resolved";
      readonly declaration: ProviderVirtualDeclarationFact;
      readonly declarationKind: CsharpProviderDeclarationKind;
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

export type CsharpProviderDeclarationKind = "export" | "member" | "signature";

export function resolveCsharpProviderDeclarationEvidence(
  navigation: SourceProgramFacts["navigation"],
  subjects: readonly (Node | undefined)[],
  requiredKind: CsharpProviderDeclarationKind,
): CsharpProviderDeclarationEvidenceResolution {
  return resolveCsharpProviderDeclarationEvidenceKinds(
    navigation,
    subjects,
    [requiredKind],
  );
}

export function resolveCsharpProviderDeclarationEvidenceKinds(
  navigation: SourceProgramFacts["navigation"],
  subjects: readonly (Node | undefined)[],
  requiredKinds: readonly [
    CsharpProviderDeclarationKind,
    ...CsharpProviderDeclarationKind[],
  ],
): CsharpProviderDeclarationEvidenceResolution {
  const declarations = uniqueProviderDeclarations(
    subjects.flatMap(subject => {
      if (subject === undefined) return [];
      const selected = navigation.providerDeclaration(subject);
      return selected.kind === "present" ? [selected.value] : [];
    }),
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
    requiredKinds.includes(providerDeclarationKind(declaration)));
  if (candidates.length === 0) {
    return {
      kind: "missing",
      reason:
        `The selected provider evidence does not contain an exact ${formatRequiredKinds(requiredKinds)} identity.`,
    };
  }
  if (candidates.length > 1) {
    return {
      kind: "conflict",
      reason:
        `The selected source operation has more than one exact provider ${formatRequiredKinds(requiredKinds)} identity.`,
      declarations: candidates,
    };
  }
  return {
    kind: "resolved",
    declaration: candidates[0]!,
    declarationKind: providerDeclarationKind(candidates[0]!),
  };
}

function formatRequiredKinds(
  requiredKinds: readonly [
    CsharpProviderDeclarationKind,
    ...CsharpProviderDeclarationKind[],
  ],
): string {
  return requiredKinds.join(" or ");
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
): CsharpProviderDeclarationKind {
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
