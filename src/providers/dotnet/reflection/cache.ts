import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  DotnetModuleModel,
} from "../model/index.js";
import type {
  DotnetProviderTelemetry,
} from "./telemetry.js";
import type {
  DotnetProviderToolIdentity,
} from "./tool.js";
import type {
  ProviderDeclarationMaterialization,
} from "@tsonic/tsts";

export interface DotnetProviderCache {
  readModule(request: DotnetProviderCacheRequest): DotnetModuleModel | undefined;
  writeModule(request: DotnetProviderCacheRequest, module: DotnetModuleModel): void;
  discardModule(request: DotnetProviderCacheRequest): void;
}

export interface DotnetProviderCacheRequest {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly providerCacheAbiVersion: string;
  readonly targetFramework: string;
  readonly moduleSpecifier: string;
  readonly namespaceName: string;
  readonly requestedExports: readonly string[] | undefined;
  readonly requestedTargetIds: readonly string[] | undefined;
  readonly requestedMetadataNames: readonly string[] | undefined;
  readonly materialization: ProviderDeclarationMaterialization;
  readonly broadImport: boolean | undefined;
  readonly assemblyName: string | undefined;
  readonly referenceSnapshotDigest: string;
  readonly assemblySourcePackages: readonly Readonly<{ readonly assemblyName: string; readonly packageName: string }>[];
  readonly toolIdentity: DotnetProviderToolIdentity;
}

interface DotnetProviderCacheRecord {
  readonly schemaVersion: 1;
  readonly request: DotnetProviderCacheRequest;
  readonly model: DotnetModuleModel;
}

export function createDotnetProviderCache(
  cacheRoot: string,
  telemetry: DotnetProviderTelemetry,
): DotnetProviderCache {
  const root = resolve(cacheRoot);
  let disabled = false;

  const disable = (): void => {
    if (disabled) {
      return;
    }
    disabled = true;
    telemetry.diskCacheDisable();
  };

  const discardFile = (cacheFile: string): void => {
    try {
      unlinkSync(cacheFile);
    } catch (error) {
      if (!isMissingPathError(error)) {
        disable();
      }
    }
  };

  return {
    readModule(request): DotnetModuleModel | undefined {
      if (disabled) {
        return undefined;
      }
      const cacheFile = requestCacheFile(root, request);
      try {
        const record = JSON.parse(readFileSync(cacheFile, "utf8")) as DotnetProviderCacheRecord;
        if (record.schemaVersion !== 1 || JSON.stringify(record.request) !== JSON.stringify(request)) {
          telemetry.diskCacheMiss();
          return undefined;
        }
        telemetry.diskCacheHit();
        return record.model;
      } catch (error) {
        if (!isMissingPathError(error)) {
          telemetry.diskCacheFailure();
          discardFile(cacheFile);
        }
        telemetry.diskCacheMiss();
        return undefined;
      }
    },
    writeModule(request, module): void {
      if (disabled) {
        return;
      }
      const cacheFile = requestCacheFile(root, request);
      const temporaryFile = `${cacheFile}.${process.pid}.${randomUUID()}.tmp`;
      try {
        mkdirSync(dirname(cacheFile), { recursive: true });
        writeFileSync(temporaryFile, JSON.stringify({
          schemaVersion: 1,
          request,
          model: module,
        } satisfies DotnetProviderCacheRecord));
        renameSync(temporaryFile, cacheFile);
      } catch {
        telemetry.diskCacheFailure();
        discardFile(temporaryFile);
        disable();
      }
    },
    discardModule(request): void {
      if (disabled) {
        return;
      }
      telemetry.diskCacheFailure();
      discardFile(requestCacheFile(root, request));
    },
  };
}

function requestCacheFile(root: string, request: DotnetProviderCacheRequest): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
  return join(root, `${hash}.json`);
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
