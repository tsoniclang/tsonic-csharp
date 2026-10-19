import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceControlTransferTarget, sourceLabeledStatementTarget, sourceEnclosingCallable, type SourceLabeledStatementTarget } from "@tsonic/target-api/source";
import { analyzeSourceStatementExits, type SourceStatementExitFacts } from "@tsonic/target-api/analysis";
import type { CsharpControlExitCompletion, CsharpStatementCompletionRecords } from "../../target-model/records/statement-completion.js";
import { createCsharpStatementCompletionRecords } from "../program/records/statement-completion.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";
import type { CsharpReturnCompletion } from "../../target-model/records/returns.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import { csharpVoidReturnCompletion } from "../../target-model/types/carriers/delegates.js";
import type { CsharpCatchBinding } from "../../target-model/records/exception-flow.js";
import type { CsharpNativeUseClassifications } from "../../target-model/records/native-demand.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";

export function analyzeCsharpStatementCompletions(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean;
  readonly required: CsharpRequiredRecord[];
  readonly facts: SourceStatementExitFacts;
  readonly returnContexts: CsharpExpectedTypeClassifications["returnContext"];
  readonly returnContracts: CsharpDeclarationClassifications["returnContract"];
  readonly values: CsharpValueReadClassifications["valueRead"];
  readonly nativeUse: CsharpNativeUseClassifications["nativeUse"];
  readonly storage: CsharpStorageClassifications["storageType"];
}): CsharpStatementCompletionRecords {
  const exits = new Map<Node, CsharpControlExitCompletion>();
  const labels = new Map<Node, SourceLabeledStatementTarget>();
  const continuations = new Map<Node, boolean>();
  const returns = new Map<Node, CsharpReturnCompletion>();
  const catches = new Map<Node, CsharpCatchBinding>();
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    if (input.ast.is.IsReturnStatement(node)) {
      const expression = input.ast.as.AsReturnStatement(node)?.Expression;
      const owner = sourceEnclosingCallable(node, input.ast);
      const target = owner === undefined ? undefined : input.returnContexts.get(owner)?.target;
      const contract = owner === undefined ? undefined : input.returnContracts.get(owner);
      const completion = expression === undefined ? contract?.kind === "resolved" && contract.undefinedReturn ? "absence" : "value"
        : csharpVoidReturnCompletion(input.values.get(expression)?.value, target) ?? "value";
      returns.set(node, Object.freeze({ kind: completion, target }));
      requireCsharpRecord(input.required, { family: "returnCompletion", subject: node,
        construct: input.ast.kindName(node), producer: "analyzeCsharpStatementCompletions" });
    } else if (input.ast.is.IsCatchClause(node)) {
      const declaration = input.ast.as.AsCatchClause(node)?.VariableDeclaration;
      const name = declaration === undefined ? undefined : input.ast.name(declaration);
      const order = input.nativeUse.order(node);
      if (order === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted catch requires its native construction order.", node);
      if (declaration === undefined || !order.some(step => step.kind === "construct" && step.construct === declaration))
        catches.set(node, Object.freeze({ kind: "unbound" }));
      else {
        const carrier = name === undefined ? undefined : input.storage.get(name);
        if (name === undefined || carrier === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted catch binding requires its checked name and native carrier.", node);
        catches.set(node, Object.freeze({ kind: isCsharpJsValueTargetType(carrier) ? "closed-value" : "native", declaration, name, carrier }));
      }
      requireCsharpRecord(input.required, { family: "catchBinding", subject: node,
        construct: input.ast.kindName(node), producer: "analyzeCsharpStatementCompletions" });
    } else if (input.ast.is.IsBreakStatement(node) || input.ast.is.IsContinueStatement(node)) {
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
  for (const node of input.nodes) {
    if (!input.admitted(node) || !input.ast.is.IsForStatement(node)) continue;
    const body = input.ast.as.AsForStatement(node)?.Statement;
    if (body === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A checked for statement requires its exact body.", node);
    const completion = analyzeSourceStatementExits(input.ast, [body], { ...input.facts,
      controlTarget: source => exits.get(source)?.target,
      continueFallsThrough: (_source, target) => target === node,
    }).get(body);
    if (completion === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A checked for body requires its source completion.", body);
    continuations.set(node, completion);
    requireCsharpRecord(input.required, { family: "loopContinuationExit", subject: node,
      construct: input.ast.kindName(node), producer: "analyzeCsharpStatementCompletions" });
  }
  return createCsharpStatementCompletionRecords({ exits, labels, continuations, returns, catches });
}
