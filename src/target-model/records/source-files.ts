export interface CsharpSourceFileOutputIdentity {
  readonly fileName: string;
  readonly namespace: string;
  readonly className: string;
  readonly artifactPath: string;
}

export interface CsharpSourceFileRecords {
  readonly sourceFile: { readonly get: (fileName: string) => CsharpSourceFileOutputIdentity | undefined };
}
