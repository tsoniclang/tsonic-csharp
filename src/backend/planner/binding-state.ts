import { requireCsharpIdentifier, tryCsharpIdentifier } from "./identifiers.js";
import type { CsharpTypeNode } from "../roslyn/syntax.js";
import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
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
  localBoundNames: Set<string>;
  localNameCounts: Map<string, number>;
  localBindingNames: WeakMap<object, string>;
  controlLabels: ControlLabelTarget[];
  currentReturnType?: CsharpTypeNode;
  currentReturnTypeSubject?: Node;
  currentReturnExpressionType?: CsharpTypeNode;
  currentReturnExpressionTypeSubject?: Node;
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
    localBoundNames: new Set(),
    localNameCounts: new Map(),
    localBindingNames: new WeakMap(),
    controlLabels: [],
  };
}

export function declareCsharpLocalBindingName(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  description: string,
  fallbackName: string,
): string {
  if (node === undefined || input.ast.kindName(node) !== KindIdentifier) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_NAME",
      category: "error",
      source: "tsonic-csharp",
      message: `${description} must be an identifier for C# local binding emission.`,
    });
    return fallbackName;
  }
  const key = localBindingKey(node, sourceFile, input);
  const existing = key === undefined ? undefined : state.localBindingNames.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const sourceName = Node_Text(node);
  const baseName = requireCsharpIdentifier(sourceName, diagnostics, description);
  const count = state.localNameCounts.get(baseName) ?? 0;
  const plannedName = count === 0 && !state.localBoundNames.has(baseName)
    ? baseName
    : allocateShadowedLocalName(baseName, state, count);
  state.localNameCounts.set(baseName, count + 1);
  state.localBoundNames.add(plannedName);
  state.usedNames.add(plannedName);
  if (key !== undefined) {
    state.localBindingNames.set(key, plannedName);
  }
  return plannedName;
}

export function getCsharpLocalBindingName(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  state: DestructuringPlannerState | undefined,
): string | undefined {
  const key = state === undefined ? undefined : localBindingKey(node, sourceFile, input);
  return key === undefined ? undefined : state!.localBindingNames.get(key);
}

export function allocateSyntheticParameter(state: DestructuringPlannerState): string {
  return allocateSyntheticName(state, "__tsonic_param", "nextParameterIndex");
}

export function allocateForOfItem(state: DestructuringPlannerState): string {
  return allocateSyntheticName(state, "__tsonic_forOfItem", "nextForOfIndex");
}

export function allocateStringIterationNames(state: DestructuringPlannerState): StringIterationSyntheticNames {
  for (;;) {
    const index = state.nextForOfIndex;
    state.nextForOfIndex += 1;
    const names = {
      collectionName: `__tsonic_forOfString${index}`,
      indexName: `__tsonic_forOfIndex${index}`,
    };
    if (!state.usedNames.has(names.collectionName) && !state.usedNames.has(names.indexName)) {
      state.usedNames.add(names.collectionName);
      state.usedNames.add(names.indexName);
      return names;
    }
  }
}

export function allocateForInNames(state: DestructuringPlannerState): ForInSyntheticNames {
  for (;;) {
    const index = state.nextForInIndex;
    state.nextForInIndex += 1;
    const names = {
      indexName: `__tsonic_forInIndex${index}`,
      collectionName: `__tsonic_forInTarget${index}`,
      keysName: `__tsonic_forInKeys${index}`,
    };
    if (
      !state.usedNames.has(names.indexName) &&
      !state.usedNames.has(names.collectionName) &&
      !state.usedNames.has(names.keysName)
    ) {
      state.usedNames.add(names.indexName);
      state.usedNames.add(names.collectionName);
      state.usedNames.add(names.keysName);
      return names;
    }
  }
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

function allocateShadowedLocalName(
  baseName: string,
  state: DestructuringPlannerState,
  initialIndex: number,
): string {
  const unescaped = baseName.startsWith("@") ? baseName.slice(1) : baseName;
  for (let index = initialIndex; ; index += 1) {
    const candidate = tryCsharpIdentifier(`${unescaped}_${index}`);
    if (candidate !== undefined && !state.localBoundNames.has(candidate) && !state.usedNames.has(candidate)) {
      return candidate;
    }
  }
}

function localBindingKey(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): object | undefined {
  const symbol = input.analysis.getSymbolAtLocation(node, { sourceFile }) ??
    input.analysis.getResolvedSymbol(node, { sourceFile });
  return asObjectKey(symbol) ?? asObjectKey(node);
}

function asObjectKey(value: unknown): object | undefined {
  return typeof value === "object" && value !== null ? value : undefined;
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
