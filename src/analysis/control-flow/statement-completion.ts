import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceControlTransferTarget, sourceLabeledStatementTarget, type SourceLabeledStatementTarget } from "@tsonic/target-api/source";
import type { CsharpControlExitCompletion, CsharpStatementCompletionRecords } from "../../target-model/records/statement-completion.js";
import { createCsharpStatementCompletionRecords } from "../program/records/statement-completion.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

export function analyzeCsharpStatementCompletions(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean;
  readonly required: CsharpRequiredRecord[];
}): CsharpStatementCompletionRecords {
  const exits = new Map<Node, CsharpControlExitCompletion>();
  const labels = new Map<Node, SourceLabeledStatementTarget>();
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    if (input.ast.is.IsBreakStatement(node) || input.ast.is.IsContinueStatement(node)) {
      const target = sourceControlTransferTarget(input.ast, node);
      if (target === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A checked control transfer requires its exact source target.", node);
      exits.set(node, Object.freeze({ target, completion: input.ast.is.IsBreakStatement(node) ? "break" : "continue" }));
      requireCsharpRecord(input.required, { family: "controlExit", subject: node,
        construct: input.ast.kindName(node), producer: "analyzeCsharpStatementCompletions" });
    } else if (input.ast.is.IsLabeledStatement(node)) {
      const selected = sourceLabeledStatementTarget(input.ast, node);
      if (selected === undefined || selected.loop !== undefined && selected.loopBody === undefined) {
        failTargetAnalysisInvariant("tsonic-csharp", "A checked label requires its exact source body and iteration target.", node);
      }
      labels.set(node, selected);
      requireCsharpRecord(input.required, { family: "labeledStatement", subject: node,
        construct: input.ast.kindName(node), producer: "analyzeCsharpStatementCompletions" });
    }
  }
  return createCsharpStatementCompletionRecords({ exits, labels });
}
