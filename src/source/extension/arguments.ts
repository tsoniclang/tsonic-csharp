import type { ArgumentPassingMode, Node } from "@tsonic/tsts";
import type { SourceProgramFacts, SourceResult } from "@tsonic/target-api/source";
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
  protocols: SourceProgramFacts["protocols"],
  expression: Node,
): CsharpSourceArgumentSelectionResult | Extract<SourceResult<never>, { readonly kind: "refused" }> {
  const publication = protocols.argumentPassing(expression);
  if (publication.kind === "refused") return publication;
  const selected = publication.value;
  if (selected.kind === "none") {
    return {
      kind: "resolved",
      argument: {
        passingMode: "by-value",
        storageExpression: expression,
      },
    };
  }
  const passing = selected.value;
  if (passing.role !== "argument" || passing.storageExpression === undefined) failTargetAnalysisInvariant("tsonic-csharp",
    "A complete Source argument-passing fact requires its exact storage expression.", expression);
  return {
    kind: "resolved",
    argument: {
      passingMode: passing.mode,
      storageExpression: passing.storageExpression,
    },
  };
}

export function csharpSourceParameterPassingMode(
  protocols: SourceProgramFacts["protocols"],
  subject: Node,
): SourceResult<ArgumentPassingMode> {
  const publication = protocols.argumentPassing(subject);
  if (publication.kind === "refused") return publication;
  const selected = publication.value;
  if (selected.kind === "none") return Object.freeze({ kind: "resolved", value: "by-value" });
  const passing = selected.value;
  if (passing.role !== "declaration") failTargetAnalysisInvariant("tsonic-csharp",
    "A Source parameter passing mode requires its original declaration fact.");
  return Object.freeze({ kind: "resolved", value: passing.mode });
}
