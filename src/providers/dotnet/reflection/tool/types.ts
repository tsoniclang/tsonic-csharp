export interface DotnetProviderToolResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface DotnetProviderToolRunner {
  readonly identity: DotnetProviderToolIdentity;
  run(args: readonly string[]): DotnetProviderToolResult;
}

export interface DotnetProviderToolIdentity {
  readonly projectPath: string;
  readonly sourceHash: string;
  readonly dllPath: string;
}

export interface DotnetProviderToolRunnerOptions {
  readonly toolProjectPath: string;
  readonly toolBuildRoot: string;
  readonly telemetry: import("../telemetry.js").DotnetProviderTelemetry;
}

export interface DotnetProviderToolResolvedPaths {
  readonly projectPath: string;
  readonly sourceHash: string;
  readonly buildRoot: string;
  readonly dllPath: string;
}
