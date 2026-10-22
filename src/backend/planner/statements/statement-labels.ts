import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpStatement } from "../../target-ast/syntax/index.js";
import {
  allocateControlLabel,
} from "../bindings/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import type { ControlLabelTarget } from "../bindings/binding-state.js";
import type { NestedStatementPlanner } from "./model.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planLabeledStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): CsharpStatement {
  const selected = input.program.records.labeledStatement.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted label lost its exact source control target.", node);
  const target: ControlLabelTarget = {
    source: node,
    breakLabel: allocateControlLabel(state, "BreakStatement", selected.name),
    ...(selected.loop !== undefined
      ? { continueLabel: allocateControlLabel(state, "ContinueStatement", selected.name), loop: selected.loop, loopBody: selected.loopBody }
      : {}),
  };
  state.controlLabels.push(target);
  let planned: CsharpStatement;
  try {
    planned = planSingleStatement(selected.body, sourceFile, input, diagnostics, state, planNestedStatementBody);
  } finally {
    state.controlLabels.pop();
  }
  return {
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        planned,
        ...(target.breakUsed === true ? [controlLabelStatement(target.breakLabel)] : []),
      ],
    },
  };
}

export function findCsharpControlTarget(
  state: DestructuringPlannerState,
  source: Node,
): ControlLabelTarget | undefined {
  for (let index = state.controlLabels.length - 1; index >= 0; index--) {
    const target = state.controlLabels[index]!;
    if (target.source === source || target.loop === source) {
      return target;
    }
  }
  return undefined;
}

function planSingleStatement(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): CsharpStatement {
  const statements = planNestedStatementBody(node, sourceFile, input, diagnostics, state);
  if (statements.length === 1) {
    return statements[0]!;
  }
  return {
    kind: "Block",
    body: { kind: "Block", statements },
  };
}

function controlLabelStatement(label: string): CsharpStatement {
  return {
    kind: "LabeledStatement",
    name: label,
    statement: {
      kind: "Block",
      body: { kind: "Block", statements: [] },
    },
  };
}
