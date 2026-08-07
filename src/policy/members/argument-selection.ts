import {
  type ArgumentPassingMode,
  argumentPassingFactKey,
  type ExtensionFactSubject,
  type Node,
  type ReadonlySourceFactResolver,
} from "@tsonic/tsts";

export interface CsharpSourceArgumentSelection {
  readonly passingMode: ArgumentPassingMode;
  readonly storageExpression: Node;
}

export type CsharpSourceArgumentSelectionResult =
  | {
      readonly kind: "resolved";
      readonly argument: CsharpSourceArgumentSelection;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export function selectCsharpSourceArgument(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  expression: Node,
): CsharpSourceArgumentSelectionResult {
  const passing = sourceFacts?.getFact(expression, argumentPassingFactKey);
  if (passing === undefined) {
    return {
      kind: "resolved",
      argument: {
        passingMode: "by-value",
        storageExpression: expression,
      },
    };
  }
  if (passing.storageExpression === undefined) {
    return {
      kind: "rejected",
      reason:
        "The exact source argument-passing fact has no storage expression.",
    };
  }
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
