export interface CsharpRuntimeProjectSource {
  readonly projectPath: string;
  readonly propertiesPath: string;
  readonly dependencies?: Readonly<Record<string, CsharpRuntimeProjectSource>>;
}

export interface CsharpRuntimeSourceProject {
  readonly projectPath: string;
  readonly propertiesPath: string;
  readonly dependencies: Readonly<Record<string, string>>;
}
