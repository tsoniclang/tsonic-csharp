export interface CsharpObjectShapeDisplayName {
  readonly canonicalName: string;
  readonly identity: string;
  readonly displayName: string;
}

export interface CsharpObjectShapeNameCandidate {
  readonly canonicalName: string;
  readonly identity: string;
  readonly preferredStem: string;
}
