export interface DotnetCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface DotnetSdkQueryHost {
  runDotnet(args: readonly string[], cwd: string): DotnetCommandResult;
}

export interface DotnetSdkInstallation {
  readonly version: string;
  readonly root: string;
}
