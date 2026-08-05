import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type {
  DotnetProviderTelemetry,
} from "./telemetry.js";

export interface DotnetReferenceSnapshot {
  readonly digest: string;
  readonly uniqueFileCount: number;
  readonly hashedBytes: number;
  appendToolArguments(args: string[]): void;
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
  readonly metadata?: ReferenceFileMetadata;
}

interface ReferenceFileMetadata {
  readonly device: string;
  readonly inode: string;
  readonly size: string;
  readonly modifiedNanoseconds: string;
  readonly changedNanoseconds: string;
}

type ReferenceDirectoryState =
  | { readonly kind: "none" }
  | { readonly kind: "missing"; readonly path: string }
  | { readonly kind: "not-directory"; readonly path: string }
  | { readonly kind: "directory"; readonly path: string; readonly files: readonly string[] };

export function createDotnetReferenceSnapshot(
  input: CreateDotnetReferenceSnapshotInput,
): DotnetReferenceSnapshot {
  const startedAt = performance.now();
  const identityByPath = new Map<string, Readonly<Record<string, unknown>>>();
  const stateByPath = new Map<string, ReferenceFileState>();
  let hashedBytes = 0;
  let initialMutation: DotnetReferenceSnapshotMutation | undefined;

  const identityFor = (path: string): Readonly<Record<string, unknown>> => {
    const resolved = resolve(path);
    const existing = identityByPath.get(resolved);
    if (existing !== undefined) {
      return existing;
    }
    const before = readReferenceFileState(resolved);
    if (!before.exists) {
      const identity = Object.freeze({ path: resolved, exists: false });
      identityByPath.set(resolved, identity);
      stateByPath.set(resolved, before);
      return identity;
    }
    const bytes = readFileSync(resolved);
    const after = readReferenceFileState(resolved);
    if (!sameReferenceFileState(before, after)) {
      initialMutation ??= {
        path: resolved,
        reason: "reference assembly changed while its compilation snapshot was being created",
      };
    }
    hashedBytes += bytes.length;
    const identity = Object.freeze({
      path: resolved,
      exists: true,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    identityByPath.set(resolved, identity);
    stateByPath.set(resolved, after);
    return identity;
  };

  const referenceDirectory = snapshotReferenceDirectory(input.referenceDirectory);
  const directoryIdentities = referenceDirectory.kind === "directory"
    ? referenceDirectory.files.map(identityFor)
    : referenceDirectory.kind === "none"
      ? []
      : [Object.freeze({
        path: referenceDirectory.path,
        exists: referenceDirectory.kind !== "missing",
        directory: false,
      })];
  const references = uniqueResolvedPaths(input.references);
  const referenceIdentities = references.map(identityFor);
  const digest = createHash("sha256")
    .update(JSON.stringify({ directoryIdentities, referenceIdentities }))
    .digest("hex");

  input.telemetry?.referenceSnapshot(
    identityByPath.size,
    hashedBytes,
    performance.now() - startedAt,
  );

  return Object.freeze({
    digest,
    uniqueFileCount: identityByPath.size,
    hashedBytes,
    appendToolArguments(args: string[]): void {
      if (referenceDirectory.kind !== "none") {
        args.push("--reference-dir", referenceDirectory.path);
      }
      for (const reference of references) {
        args.push("--reference", reference);
      }
    },
    verify(): DotnetReferenceSnapshotMutation | undefined {
      input.telemetry?.referenceSnapshotVerification();
      if (initialMutation !== undefined) {
        return initialMutation;
      }
      if (referenceDirectory.kind !== "none") {
        try {
          const directoryMutation = verifyReferenceDirectory(referenceDirectory);
          if (directoryMutation !== undefined) {
            return directoryMutation;
          }
        } catch {
          return {
            path: referenceDirectory.path,
            reason: "reference directory could not be verified during compilation",
          };
        }
      }
      for (const state of stateByPath.values()) {
        let current: ReferenceFileState;
        try {
          current = readReferenceFileState(state.path);
        } catch {
          return {
            path: state.path,
            reason: "reference assembly could not be verified during compilation",
          };
        }
        if (!sameReferenceFileState(state, current)) {
          return {
            path: state.path,
            reason: state.exists
              ? "reference assembly changed during compilation"
              : "reference assembly appeared during compilation",
          };
        }
      }
      return undefined;
    },
  });
}

function snapshotReferenceDirectory(referenceDirectory: string | undefined): ReferenceDirectoryState {
  if (referenceDirectory === undefined) {
    return { kind: "none" };
  }
  const path = resolve(referenceDirectory);
  const kind = readPathKind(path);
  if (kind === "missing") {
    return { kind: "missing", path };
  }
  if (kind === "not-directory") {
    return { kind: "not-directory", path };
  }
  return {
    kind: "directory",
    path,
    files: readReferenceDirectoryFiles(path),
  };
}

function verifyReferenceDirectory(
  state: ReferenceDirectoryState,
): DotnetReferenceSnapshotMutation | undefined {
  if (state.kind === "none") {
    return undefined;
  }
  const currentKind = readPathKind(state.path);
  if (currentKind !== state.kind) {
    return {
      path: state.path,
      reason: "reference directory changed during compilation",
    };
  }
  if (state.kind !== "directory") {
    return undefined;
  }
  const currentFiles = readReferenceDirectoryFiles(state.path);
  if (!sameStrings(state.files, currentFiles)) {
    return {
      path: state.path,
      reason: "reference directory assembly membership changed during compilation",
    };
  }
  return undefined;
}

function readPathKind(path: string): "missing" | "not-directory" | "directory" {
  try {
    return statSync(path).isDirectory() ? "directory" : "not-directory";
  } catch (error) {
    if (isMissingPathError(error)) {
      return "missing";
    }
    throw error;
  }
}

function readReferenceDirectoryFiles(path: string): readonly string[] {
  return readdirSync(path)
    .filter((name) => name.toLowerCase().endsWith(".dll"))
    .sort(compareStrings)
    .map((name) => join(path, name));
}

function readReferenceFileState(path: string): ReferenceFileState {
  try {
    const stat = statSync(path, { bigint: true });
    return {
      path,
      exists: true,
      metadata: {
        device: String(stat.dev),
        inode: String(stat.ino),
        size: String(stat.size),
        modifiedNanoseconds: String(stat.mtimeNs),
        changedNanoseconds: String(stat.ctimeNs),
      },
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return { path, exists: false };
    }
    throw error;
  }
}

function sameReferenceFileState(left: ReferenceFileState, right: ReferenceFileState): boolean {
  if (left.path !== right.path || left.exists !== right.exists) {
    return false;
  }
  if (!left.exists || !right.exists) {
    return true;
  }
  return JSON.stringify(left.metadata) === JSON.stringify(right.metadata);
}

function uniqueResolvedPaths(paths: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(paths.map((path) => resolve(path)))]);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
