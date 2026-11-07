import { type ArgumentPassingMode, argumentPassingFactKey, type ExtensionFactSubject, type Node, type ReadonlySourceFactResolver } from "@tsonic/tsts";

export interface CsharpSourceArgumentSelection {
  readonly passingMode: ArgumentPassingMode;
  readonly storageExpression: Node;
}

/**
 * WP0 A4: the Source passing selection at one expression. Only the argument role names storage: it selects its exact
 * recorded storage occurrence in its mode. No fact, or the declaration role (a provider parameter declaration carries
 * its declared mode and no storage), is ordinary by-value use of this same expression. There is no Source-rejected
 * state; the snapshot boundary rejects every other shape.
 */
export function selectCsharpSourceArgument(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  expression: Node,
): CsharpSourceArgumentSelection {
  const passing = sourceFacts?.getFact(expression, argumentPassingFactKey);
  return passing?.role === "argument"
    ? { passingMode: passing.mode, storageExpression: passing.storageExpression }
    : { passingMode: "by-value", storageExpression: expression };
}

/** The mode of either role (an argument use or a provider parameter declaration); no fact is by-value. */
export function csharpSourceArgumentPassingMode(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): ArgumentPassingMode {
  return sourceFacts?.getFact(subject, argumentPassingFactKey)?.mode ??
    "by-value";
}
