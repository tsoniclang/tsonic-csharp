export interface DotnetProviderTelemetrySnapshot {
  readonly providerInstances: number;
  readonly requestsTotal: number;
  readonly requestsByKind: Readonly<Record<string, number>>;
  readonly memoryCacheHits: number;
  readonly memoryCacheMisses: number;
  readonly diskCacheHits: number;
  readonly diskCacheMisses: number;
  readonly toolInvocations: number;
  readonly toolCliInvocations: number;
  readonly toolServerInvocations: number;
  readonly toolElapsedMs: number;
  readonly modelBytes: number;
  readonly virtualDeclarationBytes: number;
  readonly virtualDeclarationCount: number;
}

export interface DotnetProviderTelemetry {
  providerInstance(): void;
  request(kind: string): void;
  memoryCacheHit(): void;
  memoryCacheMiss(): void;
  diskCacheHit(): void;
  diskCacheMiss(): void;
  toolInvocation(mode: "cli" | "server", elapsedMs: number): void;
  modelBytes(bytes: number): void;
  virtualDeclarations(count: number, bytes: number): void;
  snapshot(): DotnetProviderTelemetrySnapshot;
}

export function createDotnetProviderTelemetry(): DotnetProviderTelemetry {
  let providerInstances = 0;
  let requestsTotal = 0;
  const requestsByKind = new Map<string, number>();
  let memoryCacheHits = 0;
  let memoryCacheMisses = 0;
  let diskCacheHits = 0;
  let diskCacheMisses = 0;
  let toolInvocations = 0;
  let toolCliInvocations = 0;
  let toolServerInvocations = 0;
  let toolElapsedMs = 0;
  let modelBytes = 0;
  let virtualDeclarationBytes = 0;
  let virtualDeclarationCount = 0;
  return {
    providerInstance(): void {
      providerInstances += 1;
    },
    request(kind: string): void {
      requestsTotal += 1;
      requestsByKind.set(kind, (requestsByKind.get(kind) ?? 0) + 1);
    },
    memoryCacheHit(): void {
      memoryCacheHits += 1;
    },
    memoryCacheMiss(): void {
      memoryCacheMisses += 1;
    },
    diskCacheHit(): void {
      diskCacheHits += 1;
    },
    diskCacheMiss(): void {
      diskCacheMisses += 1;
    },
    toolInvocation(mode: "cli" | "server", elapsedMs: number): void {
      toolInvocations += 1;
      toolElapsedMs += elapsedMs;
      if (mode === "cli") {
        toolCliInvocations += 1;
      } else {
        toolServerInvocations += 1;
      }
    },
    modelBytes(bytes: number): void {
      modelBytes += bytes;
    },
    virtualDeclarations(count: number, bytes: number): void {
      virtualDeclarationCount += count;
      virtualDeclarationBytes += bytes;
    },
    snapshot(): DotnetProviderTelemetrySnapshot {
      return {
        providerInstances,
        requestsTotal,
        requestsByKind: Object.fromEntries(requestsByKind),
        memoryCacheHits,
        memoryCacheMisses,
        diskCacheHits,
        diskCacheMisses,
        toolInvocations,
        toolCliInvocations,
        toolServerInvocations,
        toolElapsedMs,
        modelBytes,
        virtualDeclarationBytes,
        virtualDeclarationCount,
      };
    },
  };
}

export const dotnetProviderGlobalTelemetry = createDotnetProviderTelemetry();
