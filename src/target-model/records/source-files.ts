export interface CsharpSourceFileOutputIdentity {
  readonly fileName: string;
  readonly namespace: string;
  readonly className: string;
  readonly modulePath: string;
}

export interface CsharpSourceFileRecords {
  readonly providerSourceFile: { readonly get: (file: import("@tsonic/tsts").SourceFile) => boolean | undefined };
  readonly sourceFile: { readonly get: (fileName: string) => CsharpSourceFileOutputIdentity | undefined };
}
