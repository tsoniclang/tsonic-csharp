export interface CsharpRuntimeProjectInstance {
  readonly path: string;
  readonly sourceProject: string;
  readonly sourceProperties: string;
  readonly framework: string;
  readonly dependencies: Readonly<Record<string, string>>;
}
