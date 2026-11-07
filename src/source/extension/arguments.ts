import { type ArgumentPassingMode, argumentPassingFactKey, type ExtensionFactSubject, type Node, type ReadonlySourceFactResolver } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export interface CsharpSourceArgumentSelection {
  readonly passingMode: ArgumentPassingMode;
  readonly storageExpression: Node;
}

export interface CsharpSourceArgumentSelectionResult {
  readonly kind: "resolved";
  readonly argument: CsharpSourceArgumentSelection;
}

export function selectCsharpSourceArgument(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  expression: Node,
): CsharpSourceArgumentSelectionResult {
  const passing = sourceFacts?.getFact(expression, argumentPassingFactKey);
  if (passing === undefined || passing.kind === "declaration") {
    return {
      kind: "resolved",
      argument: {
        passingMode: "by-value",
        storageExpression: expression,
      },
    };
  }
  if (passing.kind !== "argument" || passing.storageExpression === undefined) failTargetAnalysisInvariant("tsonic-csharp",
    "A complete Source argument-passing fact requires its exact storage expression.", expression);
  return {
    kind: "resolved",
    argument: {
      passingMode: passing.mode,
      storageExpression: passing.storageExpression,
    },
  };
}

export function csharpSourceArgumentPassingMode(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): ArgumentPassingMode {
  return sourceFacts?.getFact(subject, argumentPassingFactKey)?.mode ??
    "by-value";
}
