import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type {
  DotnetProviderTelemetry,
} from "./telemetry.js";

/**
 * Compilation-scoped immutable snapshot of the selected .NET reference set.
 *
 * Every unique assembly is normalized and content-hashed exactly once per
 * provider session. Module cache requests reuse the precomputed identity
 * records; they never reread assembly bytes. The identity record shape is the
 * exact shape previously computed per request, so persisted cache keys remain
 * content-equivalent across this change.
 */
export interface DotnetReferenceSnapshot {
  readonly digest: string;
  readonly directoryIdentities: readonly Readonly<Record<string, unknown>>[];
  readonly referenceIdentities: readonly Readonly<Record<string, unknown>>[];
  readonly uniqueFileCount: number;
  readonly hashedBytes: number;
  verify(): DotnetReferenceSnapshotMutation | undefined;
}

export interface DotnetReferenceSnapshotMutation {
  readonly path: string;
  readonly reason: string;
}

export interface CreateDotnetReferenceSnapshotInput {
  readonly referenceDirectory: string | undefined;
  readonly references: readonly string[];
  readonly telemetry?: DotnetProviderTelemetry;
}

interface ReferenceFileState {
  readonly path: string;
  readonly exists: boolean;
  readonly size?: number;
  readonly mtimeMs?: number;
}

export function createDotnetReferenceSnapshot(
  input: CreateDotnetReferenceSnapshotInput,
): DotnetReferenceSnapshot {
  const startedAt = performance.now();
  const identityByPath = new Map<string, Readonly<Record<string, unknown>>>();
  const stateByPath = new Map<string, ReferenceFileState>();
  let hashedBytes = 0;

  const identityFor = (path: string): Readonly<Record<string, unknown>> => {
    const resolved = resolve(path);
    const existing = identityByPath.get(resolved);
    if (existing !== undefined) {
      return existing;
    }
    if (!existsSync(resolved)) {
      const identity = Object.freeze({ path: resolved, exists: false });
      identityByPath.set(resolved, identity);
      stateByPath.set(resolved, { path: resolved, exists: false });
      return identity;
    }
    const stat = statSync(resolved);
    const bytes = readFileSync(resolved);
    hashedBytes += bytes.length;
    const identity = Object.freeze({
      path: resolved,
      exists: true,
      size: stat.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    identityByPath.set(resolved, identity);
    stateByPath.set(resolved, {
      path: resolved,
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
    return identity;
  };

  const directoryIdentities = snapshotDirectoryIdentities(input.referenceDirectory, identityFor);
  const referenceIdentities = input.references.map((reference) => identityFor(reference));

  const digest = createHash("sha256")
    .update(JSON.stringify({
      directoryIdentities,
      referenceIdentities,
    }))
    .digest("hex");
  input.telemetry?.referenceSnapshot(
    identityByPath.size,
    hashedBytes,
    performance.now() - startedAt,
  );

  return Object.freeze({
    digest,
    directoryIdentities,
    referenceIdentities,
    uniqueFileCount: identityByPath.size,
    hashedBytes,
    verify(): DotnetReferenceSnapshotMutation | undefined {
      input.telemetry?.referenceSnapshotVerification();
      for (const state of stateByPath.values()) {
        const mutation = verifyReferenceFileState(state);
        if (mutation !== undefined) {
          return mutation;
        }
      }
      return undefined;
    },
  });
}

function snapshotDirectoryIdentities(
  referenceDirectory: string | undefined,
  identityFor: (path: string) => Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] {
  if (referenceDirectory === undefined) {
    return [];
  }
  const resolved = resolve(referenceDirectory);
  if (!existsSync(resolved)) {
    return [Object.freeze({ path: resolved, exists: false })];
  }
  const stat = statSync(resolved);
  if (!stat.isDirectory()) {
    return [Object.freeze({ path: resolved, exists: true, directory: false })];
  }
  return readdirSync(resolved)
    .filter((name) => name.toLowerCase().endsWith(".dll"))
    .sort()
    .map((name) => identityFor(join(resolved, name)));
}

function verifyReferenceFileState(
  state: ReferenceFileState,
): DotnetReferenceSnapshotMutation | undefined {
  const exists = existsSync(state.path);
  if (exists !== state.exists) {
    return {
      path: state.path,
      reason: state.exists
        ? "reference assembly was removed during compilation"
        : "reference assembly appeared during compilation",
    };
  }
  if (!state.exists) {
    return undefined;
  }
  const stat = statSync(state.path);
  if (stat.size !== state.size || stat.mtimeMs !== state.mtimeMs) {
    return {
      path: state.path,
      reason: "reference assembly changed during compilation",
    };
  }
  return undefined;
}
