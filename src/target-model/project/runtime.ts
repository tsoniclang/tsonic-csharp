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

export interface CsharpRuntimeProjectInstance {
  readonly path: string;
  readonly sourceProject: string;
  readonly sourceProperties: string;
  readonly framework: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly text: string;
}
