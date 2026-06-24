import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  DotnetModuleModel,
} from "../model.js";
import type {
  DotnetProviderTelemetry,
} from "./telemetry.js";
import type {
  DotnetProviderToolIdentity,
} from "./tool.js";

export interface DotnetProviderCache {
  readModule(request: DotnetProviderCacheRequest): DotnetModuleModel | undefined;
  writeModule(request: DotnetProviderCacheRequest, module: DotnetModuleModel): void;
}

export interface DotnetProviderCacheRequest {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly providerCacheAbiVersion: string;
  readonly targetFramework: string;
  readonly moduleSpecifier: string;
  readonly namespaceName: string;
  readonly requestedExports: readonly string[] | undefined;
  readonly broadImport: boolean | undefined;
  readonly referenceDirectory: string | undefined;
  readonly referenceIdentities: readonly Readonly<Record<string, unknown>>[];
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
  return {
    readModule(request): DotnetModuleModel | undefined {
      const cacheFile = requestCacheFile(root, request);
      if (!existsSync(cacheFile)) {
        telemetry.diskCacheMiss();
        return undefined;
      }
      try {
        const record = JSON.parse(readFileSync(cacheFile, "utf8")) as DotnetProviderCacheRecord;
        if (record.schemaVersion !== 1 || JSON.stringify(record.request) !== JSON.stringify(request)) {
          telemetry.diskCacheMiss();
          return undefined;
        }
        telemetry.diskCacheHit();
        return record.model;
      } catch {
        telemetry.diskCacheMiss();
        return undefined;
      }
    },
    writeModule(request, module): void {
      const cacheFile = requestCacheFile(root, request);
      mkdirSync(dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify({
        schemaVersion: 1,
        request,
        model: module,
      } satisfies DotnetProviderCacheRecord));
    },
  };
}

function requestCacheFile(root: string, request: DotnetProviderCacheRequest): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
  return join(root, `${hash}.json`);
}
