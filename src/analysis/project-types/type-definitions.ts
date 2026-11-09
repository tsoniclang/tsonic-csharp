import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpNativeDeclaration } from "../../target-model/types/native-declarations.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/native-definitions.js";
import type { CsharpProviderNativeDeclarationResolution } from "../../target-model/metadata/provider-metadata.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { applyCsharpNativeDeclaration, csharpNativeDeclarationKey, snapshotCsharpNativeDeclaration } from "../../target-model/types/native-declaration-operations.js";

export interface CsharpNativeDeclarationTransaction {
  reserve(identity: string): void;
  complete(definition: CsharpNativeDeclaration): void;
  commit(): readonly CsharpNativeDeclaration[];
  abort(): void;
}

export interface CsharpTypeDefinitionRegistry extends CsharpTypeDefinitions {
  acquireNativeDeclaration(identity: string): CsharpProviderNativeDeclarationResolution;
  begin(): CsharpNativeDeclarationTransaction;
  seal(): CsharpTypeDefinitions;
}

export function createCsharpTypeDefinitionRegistry(
  acquire: (identity: string) => CsharpProviderNativeDeclarationResolution,
): CsharpTypeDefinitionRegistry {
  const declarations = new Map<string, CsharpNativeDeclaration>();
  const reservations = new Map<string, object>();
  const applications = new Map<string, ReturnType<CsharpTypeDefinitions["nativeDeclaration"]>>();
  let sealed = false;

  const nativeDeclaration: CsharpTypeDefinitions["nativeDeclaration"] = carrier => {
    if (carrier.kind !== "target-named") return undefined;
    const definition = declarations.get(carrier.id);
    if (definition === undefined) return undefined;
    const key = targetTypeRefKey(carrier, "emission");
    if (applications.has(key)) return applications.get(key);
    const application = applyCsharpNativeDeclaration(definition, carrier);
    applications.set(key, application);
    return application;
  };
  const nativeDeclarationKind: CsharpTypeDefinitions["nativeDeclarationKind"] = carrier => nativeDeclaration(carrier)?.definition.kind;
  const nativeSupertypes: CsharpTypeDefinitions["nativeSupertypes"] = carrier => nativeDeclaration(carrier)?.supertypes;

  function acquireNativeDeclaration(identity: string): CsharpProviderNativeDeclarationResolution {
    if (sealed || identity.length === 0 || reservations.has(identity)) failTargetAnalysisInvariant("tsonic-csharp",
      "A Native declaration acquisition requires an original unreserved identity before sealing.");
    const existing = declarations.get(identity);
    if (existing !== undefined) return Object.freeze({ kind: "resolved", definition: existing });
    const selected = acquire(identity);
    if (selected.kind !== "resolved") return selected;
    const transaction = begin();
    transaction.reserve(identity);
    try {
      transaction.complete(selected.definition);
      const definition = transaction.commit()[0]!;
      return Object.freeze({ kind: "resolved", definition });
    } catch (error) {
      transaction.abort();
      throw error;
    }
  }

  function begin(): CsharpNativeDeclarationTransaction {
    if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "Native declaration transactions begin before sealing.");
    const token = Object.freeze({});
    const reserved = new Set<string>();
    const completed = new Map<string, CsharpNativeDeclaration>();
    let open = true;
    const requireOpen = (): void => {
      if (!open || sealed) failTargetAnalysisInvariant("tsonic-csharp", "A Native declaration transaction completes exactly once before sealing.");
    };
    const release = (): void => {
      for (const identity of reserved) if (reservations.get(identity) === token) reservations.delete(identity);
      open = false;
    };
    return Object.freeze({
      reserve(identity: string) {
        requireOpen();
        if (identity.length === 0 || reserved.has(identity) || reservations.has(identity)) failTargetAnalysisInvariant("tsonic-csharp",
          "A Native declaration transaction reserves each original physical identity exactly once.");
        reserved.add(identity);
        reservations.set(identity, token);
      },
      complete(definition: CsharpNativeDeclaration) {
        requireOpen();
        const immutable = snapshotCsharpNativeDeclaration(definition);
        if (!reserved.has(immutable.carrier.id) || completed.has(immutable.carrier.id)) failTargetAnalysisInvariant("tsonic-csharp",
          "A complete Native definition belongs to its one original reserved transaction identity.");
        completed.set(immutable.carrier.id, immutable);
      },
      commit() {
        requireOpen();
        try {
          if (completed.size !== reserved.size) failTargetAnalysisInvariant("tsonic-csharp",
            "Every reserved Native declaration requires its complete member and binder inventory before publication.");
          const result = [...completed.values()].map(definition => {
            const previous = declarations.get(definition.carrier.id);
            if (previous !== undefined && csharpNativeDeclarationKey(previous) !== csharpNativeDeclarationKey(definition)) {
              failTargetAnalysisInvariant("tsonic-csharp", "One Native definition cannot publish competing binders, members or implemented contracts.");
            }
            return previous ?? definition;
          });
          if (declarations.size + result.filter(definition => !declarations.has(definition.carrier.id)).length > 1_048_576) {
            failTargetAnalysisInvariant("tsonic-csharp", "The Native declaration catalog exceeds its finite resource bound.");
          }
          for (const definition of result) {
            declarations.set(definition.carrier.id, definition);
          }
          return Object.freeze(result);
        } finally {
          release();
        }
      },
      abort() { release(); },
    });
  }

  return Object.freeze({ nativeDeclaration, nativeDeclarationKind, nativeSupertypes, acquireNativeDeclaration, begin,
    seal() {
      if (sealed || reservations.size !== 0) failTargetAnalysisInvariant("tsonic-csharp",
        "The Native declaration catalog seals exactly once after every reserved transaction completes or aborts.");
      sealed = true;
      return Object.freeze({ nativeDeclaration, nativeDeclarationKind, nativeSupertypes });
    },
  });
}
