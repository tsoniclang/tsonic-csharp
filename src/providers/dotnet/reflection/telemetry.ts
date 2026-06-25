export interface DotnetProviderTelemetrySnapshot {
  readonly providerInstances: number;
  readonly requestsTotal: number;
  readonly requestsByKind: Readonly<Record<string, number>>;
  readonly memoryCacheHits: number;
  readonly memoryCacheMisses: number;
  readonly diskCacheHits: number;
  readonly diskCacheMisses: number;
  readonly providerToolBuilds: number;
  readonly providerToolBuildElapsedMs: number;
  readonly toolInvocations: number;
  readonly toolCliInvocations: number;
  readonly toolServerInvocations: number;
  readonly toolElapsedMs: number;
  readonly modelBytes: number;
  readonly virtualDeclarationBytes: number;
  readonly virtualDeclarationCount: number;
  readonly virtualDeclarationRenderMs: number;
  readonly tstsProviderVirtualParseMs: number;
  readonly tstsProviderVirtualCheckMs: number;
  readonly generatedDotnetBuildElapsedMs: number;
}

export interface DotnetProviderTelemetry {
  providerInstance(): void;
  request(kind: string): void;
  memoryCacheHit(): void;
  memoryCacheMiss(): void;
  diskCacheHit(): void;
  diskCacheMiss(): void;
  toolBuild(elapsedMs: number): void;
  toolInvocation(mode: "cli" | "server", elapsedMs: number): void;
  modelBytes(bytes: number): void;
  virtualDeclarations(count: number, bytes: number, renderElapsedMs?: number): void;
  tstsProviderVirtualParse(elapsedMs: number): void;
  tstsProviderVirtualCheck(elapsedMs: number): void;
  generatedDotnetBuild(elapsedMs: number): void;
  snapshot(): DotnetProviderTelemetrySnapshot;
}

export type DotnetProviderTelemetryCounters = Readonly<Record<string, number>>;

export function createDotnetProviderTelemetry(): DotnetProviderTelemetry {
  let providerInstances = 0;
  let requestsTotal = 0;
  const requestsByKind = new Map<string, number>();
  let memoryCacheHits = 0;
  let memoryCacheMisses = 0;
  let diskCacheHits = 0;
  let diskCacheMisses = 0;
  let providerToolBuilds = 0;
  let providerToolBuildElapsedMs = 0;
  let toolInvocations = 0;
  let toolCliInvocations = 0;
  let toolServerInvocations = 0;
  let toolElapsedMs = 0;
  let modelBytes = 0;
  let virtualDeclarationBytes = 0;
  let virtualDeclarationCount = 0;
  let virtualDeclarationRenderMs = 0;
  let tstsProviderVirtualParseMs = 0;
  let tstsProviderVirtualCheckMs = 0;
  let generatedDotnetBuildElapsedMs = 0;
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
    toolBuild(elapsedMs: number): void {
      providerToolBuilds += 1;
      providerToolBuildElapsedMs += elapsedMs;
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
    virtualDeclarations(count: number, bytes: number, renderElapsedMs = 0): void {
      virtualDeclarationCount += count;
      virtualDeclarationBytes += bytes;
      virtualDeclarationRenderMs += renderElapsedMs;
    },
    tstsProviderVirtualParse(elapsedMs: number): void {
      tstsProviderVirtualParseMs += elapsedMs;
    },
    tstsProviderVirtualCheck(elapsedMs: number): void {
      tstsProviderVirtualCheckMs += elapsedMs;
    },
    generatedDotnetBuild(elapsedMs: number): void {
      generatedDotnetBuildElapsedMs += elapsedMs;
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
        providerToolBuilds,
        providerToolBuildElapsedMs,
        toolInvocations,
        toolCliInvocations,
        toolServerInvocations,
        toolElapsedMs,
        modelBytes,
        virtualDeclarationBytes,
        virtualDeclarationCount,
        virtualDeclarationRenderMs,
        tstsProviderVirtualParseMs,
        tstsProviderVirtualCheckMs,
        generatedDotnetBuildElapsedMs,
      };
    },
  };
}

export const dotnetProviderGlobalTelemetry = createDotnetProviderTelemetry();

export function dotnetProviderTelemetryCounters(
  snapshot: DotnetProviderTelemetrySnapshot,
): DotnetProviderTelemetryCounters {
  return {
    "provider.instances": snapshot.providerInstances,
    "provider.requests.total": snapshot.requestsTotal,
    "provider.cache.memory.hit": snapshot.memoryCacheHits,
    "provider.cache.memory.miss": snapshot.memoryCacheMisses,
    "provider.cache.disk.hit": snapshot.diskCacheHits,
    "provider.cache.disk.miss": snapshot.diskCacheMisses,
    "provider.tool.builds": snapshot.providerToolBuilds,
    "provider.tool.build.elapsedMs": snapshot.providerToolBuildElapsedMs,
    "provider.tool.invocations": snapshot.toolInvocations,
    "provider.tool.mode.cli": snapshot.toolCliInvocations,
    "provider.tool.mode.server": snapshot.toolServerInvocations,
    "provider.tool.elapsedMs": snapshot.toolElapsedMs,
    "provider.model.bytes": snapshot.modelBytes,
    "provider.virtualSource.bytes": snapshot.virtualDeclarationBytes,
    "provider.virtualDeclarations.count": snapshot.virtualDeclarationCount,
    "provider.virtualDeclarations.renderMs": snapshot.virtualDeclarationRenderMs,
    "tsts.providerVirtual.parseMs": snapshot.tstsProviderVirtualParseMs,
    "tsts.providerVirtual.checkMs": snapshot.tstsProviderVirtualCheckMs,
    "generatedProject.dotnetBuild.elapsedMs": snapshot.generatedDotnetBuildElapsedMs,
  };
}

export function formatDotnetProviderTelemetrySnapshot(
  snapshot: DotnetProviderTelemetrySnapshot,
): string {
  const counters = dotnetProviderTelemetryCounters(snapshot);
  const requestCounters = Object.entries(snapshot.requestsByKind)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `provider.requests.byKind.${kind}=${count}`);
  return [
    ...Object.entries(counters).map(([name, value]) => `${name}=${formatTelemetryNumber(value)}`),
    ...requestCounters,
  ].join("\n");
}

function formatTelemetryNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
