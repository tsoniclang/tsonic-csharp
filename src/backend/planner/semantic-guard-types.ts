export interface SemanticOwnership {
  readonly requiresTargetFact: boolean;
  readonly sourceOwned: boolean;
  readonly reasons: readonly string[];
}

export interface OperationSemanticOwnership extends SemanticOwnership {}
