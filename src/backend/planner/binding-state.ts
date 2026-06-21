import { tryCsharpIdentifier } from "./identifiers.js";
import type { CsharpTypeNode } from "../roslyn/syntax.js";
import type { AstReader, Node } from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../../source/fact-subjects.js";
import {
  KindIdentifier,
  Node_Text,
} from "./source-ast.js";

export interface DestructuringPlannerState {
  nextTempIndex: number;
  nextParameterIndex: number;
  nextForOfIndex: number;
  nextForInIndex: number;
  nextCatchIndex: number;
  nextControlLabelIndex: number;
  usedNames: Set<string>;
  controlLabels: ControlLabelTarget[];
  currentReturnType?: CsharpTypeNode;
  currentReturnTypeSubject?: Node;
}

export interface ControlLabelTarget {
  readonly sourceName: string;
  readonly breakLabel: string;
  readonly continueLabel?: string;
}

export interface ForInSyntheticNames {
  readonly indexName: string;
  readonly collectionName: string;
  readonly keysName: string;
}

export interface StringIterationSyntheticNames {
  readonly collectionName: string;
  readonly indexName: string;
}

export function createDestructuringPlannerState(root?: Node, ast?: AstReader): DestructuringPlannerState {
  const usedNames = new Set<string>();
  collectReservedSourceNames(root, usedNames, new WeakSet<object>(), ast);
  return {
    nextTempIndex: 0,
    nextParameterIndex: 0,
    nextForOfIndex: 0,
    nextForInIndex: 0,
    nextCatchIndex: 0,
    nextControlLabelIndex: 0,
    usedNames,
    controlLabels: [],
  };
}

export function allocateSyntheticParameter(state: DestructuringPlannerState): string {
  return allocateSyntheticName(state, "__tsonic_param", "nextParameterIndex");
}

export function allocateForOfItem(state: DestructuringPlannerState): string {
  return allocateSyntheticName(state, "__tsonic_forOfItem", "nextForOfIndex");
}

export function allocateStringIterationNames(state: DestructuringPlannerState): StringIterationSyntheticNames {
  return {
    collectionName: allocateSyntheticName(state, "__tsonic_forOfString", "nextForOfIndex"),
    indexName: allocateSyntheticName(state, "__tsonic_forOfIndex", "nextForOfIndex"),
  };
}

export function allocateForInNames(state: DestructuringPlannerState): ForInSyntheticNames {
  return {
    indexName: allocateSyntheticName(state, "__tsonic_forInIndex", "nextForInIndex"),
    collectionName: allocateSyntheticName(state, "__tsonic_forInTarget", "nextForInIndex"),
    keysName: allocateSyntheticName(state, "__tsonic_forInKeys", "nextForInIndex"),
  };
}

export function allocateCatchValue(state: DestructuringPlannerState): string {
  return allocateSyntheticName(state, "__tsonic_catch", "nextCatchIndex");
}

export function allocateControlLabel(
  state: DestructuringPlannerState,
  sourceName: string,
  purpose: "BreakStatement" | "ContinueStatement",
): string {
  const suffix = purpose === "BreakStatement" ? "break" : "continue";
  return allocateSyntheticName(state, `__tsonic_label_${sourceName}_${suffix}`, "nextControlLabelIndex");
}

export function allocateDestructuringTemp(state: DestructuringPlannerState): string {
  return allocateSyntheticName(state, "__tsonic_destructure", "nextTempIndex");
}

function allocateSyntheticName(
  state: DestructuringPlannerState,
  prefix: string,
  counterName: "nextTempIndex" | "nextParameterIndex" | "nextForOfIndex" | "nextForInIndex" | "nextCatchIndex" | "nextControlLabelIndex",
): string {
  for (;;) {
    const name = `${prefix}${state[counterName]}`;
    state[counterName] += 1;
    if (!state.usedNames.has(name)) {
      state.usedNames.add(name);
      return name;
    }
  }
}

function collectReservedSourceNames(value: unknown, names: Set<string>, seen: WeakSet<object>, ast: AstReader | undefined): void {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return;
  }
  seen.add(value);
  const node = asNodeSubject(value);
  if (node !== undefined && ast?.kindName(node) === KindIdentifier) {
    const identifier = tryCsharpIdentifier(Node_Text(node));
    if (identifier !== undefined) {
      names.add(identifier);
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectReservedSourceNames(item, names, seen, ast);
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "Parent" || key === "Symbol" || key === "LocalSymbol" || key === "FlowNode") {
      continue;
    }
    collectReservedSourceNames(item, names, seen, ast);
  }
}
