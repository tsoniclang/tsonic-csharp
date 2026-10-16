import type { Node } from "@tsonic/tsts";
import { targetUseSiteIdentity, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { selectCsharpNativeConstructSteps } from "../../policy/operations/control-flow/native-constructs.js";
import { selectCsharpNativeOperandUses, type CsharpNativeOperandSelection, type CsharpNativeOperandStep } from "../../policy/operations/control-flow/native-operands.js";
import { selectCsharpNativeCompletion, type CsharpNativeCompletionFlow } from "../../policy/operations/control-flow/native-completion.js";
import { csharpNativeUseSite, type CsharpExpectedNativeUse, type CsharpNativeChildUse, type CsharpNativeCompletion,
  type CsharpNativeEvaluation, type CsharpNativeOrderStep, type CsharpNativeUse } from "../../target-model/records/native-demand.js";
import { csharpConstructorBaseCall } from "../callables/constructor-entry.js";
import { isCsharpUnusedTupleDefault } from "../control-flow/binding-patterns.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { isCsharpRecordDictionaryTargetType } from "../../target-model/types/carriers/collections.js";
import type { CsharpNativePropertyKey } from "../../target-model/conversions/exact-literals.js";
import type { CsharpNativeDemandAnalysis, CsharpNativeDemandAnalysisInput, CsharpNativeUnadmittedReason } from "./native-demand-model.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

interface VisitedUse {
  readonly site: TargetUseSiteRef;
  readonly expression: Node;
  readonly completion: CsharpNativeCompletion | undefined;
}

interface UseState {
  readonly expression: Node;
  readonly state: "visiting" | "closed";
  readonly visited: VisitedUse;
}

type PendingExpectedUse = CsharpNativeDemandAnalysisInput["expected"]["pending"][number];

interface ExpectedSlot {
  readonly expressions: Map<Node, { readonly site: TargetUseSiteRef; readonly use: CsharpExpectedNativeUse }[]>;
  readonly pending: PendingExpectedUse[];
}

export function analyzeCsharpNativeDemand(
  input: CsharpNativeDemandAnalysisInput,
  requiredRecords: CsharpRequiredRecord[],
): CsharpNativeDemandAnalysis {
  const { ast } = input;
  const baseCalls = new WeakMap<Node, Node>();
  const unusedDefaults = new WeakSet<Node>();
  const indexInputs = (node: Node): void => {
    if (ast.is.IsConstructorDeclaration(node)) {
      const call = csharpConstructorBaseCall(ast, node);
      if (call !== undefined) baseCalls.set(node, call);
    }
    if (isCsharpUnusedTupleDefault(ast, input.bindingPatterns.bindingPatternProjection, node)) unusedDefaults.add(node);
    ast.forEachChild(node, child => { if (child !== undefined) indexInputs(child); });
  };
  for (const file of input.sourceFiles) indexInputs(file);
  const policyInput = { ...input, baseCalls: Object.freeze({ get: (node: Node) => baseCalls.get(node) }),
    unusedDefault: Object.freeze({ get: (node: Node) => unusedDefaults.has(node) }) };
  const entries: { readonly site: TargetUseSiteRef; readonly use: CsharpNativeUse }[] = [];
  const unadmitted: { readonly site: TargetUseSiteRef; readonly expression: Node;
    readonly reason: CsharpNativeUnadmittedReason; readonly message?: string; readonly code?: string }[] = [];
  const states = new Map<object, Map<string, UseState>>();
  const published = new Map<object, Map<string, CsharpNativeUse>>();
  const emissions = new Map<Node, { readonly site: TargetUseSiteRef; readonly use: CsharpNativeUse }>();
  const orders = new Map<Node, readonly CsharpNativeOrderStep[]>();
  const constructs = new Set<Node>();
  const requiredBindingRoots = new Set<Node>();
  const slots = new Map<object, Map<string, ExpectedSlot>>();
  const slot = (site: TargetUseSiteRef): ExpectedSlot => {
    let owner = slots.get(site.subject);
    if (owner === undefined) { owner = new Map(); slots.set(site.subject, owner); }
    let value = owner.get(site.role);
    if (value === undefined) { value = { expressions: new Map(), pending: [] }; owner.set(site.role, value); }
    return value;
  };
  for (const entry of input.expected.entries) {
    const byExpression = slot(entry.site).expressions;
    const uses = byExpression.get(entry.use.expression) ?? [];
    uses.push(entry); byExpression.set(entry.use.expression, uses);
  }
  for (const entry of input.expected.pending) slot(entry.site).pending.push(entry);
  const exactPending = new Map<object, Map<string, PendingExpectedUse>>();
  for (const entry of input.expected.pending) {
    const owner = exactPending.get(entry.site.subject) ?? new Map();
    owner.set(targetUseSiteIdentity(entry.site), entry); exactPending.set(entry.site.subject, owner);
  }
  for (const file of input.sourceFiles) visitConstruct(file);
  return Object.freeze({ entries: Object.freeze(entries), unadmitted: Object.freeze(unadmitted),
    requiredBindingRoots: Object.freeze([...requiredBindingRoots]),
    nativeUse: Object.freeze({ get: (site: TargetUseSiteRef) => published.get(site.subject)?.get(targetUseSiteIdentity(site)),
      order: (construct: Node) => orders.get(construct), expression: (node: Node) => emissions.get(node) }) });

  function publish(site: TargetUseSiteRef, use: CsharpNativeUse): VisitedUse {
    let owner = published.get(site.subject);
    if (owner === undefined) { owner = new Map(); published.set(site.subject, owner); }
    const identity = targetUseSiteIdentity(site);
    if (owner.has(identity)) failTargetAnalysisInvariant("tsonic-csharp", `A native use is published twice for '${site.role}'.`, use.expression);
    const frozen = Object.freeze(use);
    requireCsharpRecord(requiredRecords, { family: "nativeUse", subject: use.expression, site,
      construct: "admitted native consumption", producer: "analyzeCsharpNativeDemand" });
    owner.set(identity, frozen);
    const entry = Object.freeze({ site, use: frozen });
    entries.push(entry);
    if (site.role !== "constructed-result" && site.role !== "present-payload") {
      const previous = emissions.get(use.expression);
      if (previous !== undefined && (previous.site.subject !== site.subject ||
        targetUseSiteIdentity(previous.site) !== identity)) {
        failTargetAnalysisInvariant("tsonic-csharp", "A source expression has more than one native emission context.", use.expression);
      }
      emissions.set(use.expression, entry);
    }
    return Object.freeze({ site, expression: use.expression, completion: use.kind === "erased" ? undefined : use.completion });
  }

  function pending(site: TargetUseSiteRef, expression: Node, reason: CsharpNativeUnadmittedReason, message?: string, code?: string): VisitedUse {
    unadmitted.push(Object.freeze({ site, expression, reason, ...(message === undefined ? {} : { message }), ...(code === undefined ? {} : { code }) }));
    return Object.freeze({ site, expression, completion: undefined });
  }

  function visitConstruct(node: Node): void {
    if (constructs.has(node)) return;
    constructs.add(node);
    const participation = input.participation.get(node);
    if (participation === "body" || participation === "frame-body" || participation === "signature") {
      for (const parameter of ast.parameters(node)) if (parameter !== undefined) requiredBindingRoots.add(parameter);
    }
    const steps: CsharpNativeOrderStep[] = [];
    if (ast.is.IsExpressionStatement(node) && input.operations.erasedStatement.get(node)) {
      const expression = ast.as.AsExpressionStatement(node)?.Expression;
      if (expression !== undefined) {
        const site = csharpNativeUseSite(node, { kind: "effect" });
        publish(site, { kind: "erased", expression, cause: "erased-statement" });
        steps.push(Object.freeze({ kind: "use", site }));
      }
    } else for (const step of selectCsharpNativeConstructSteps(policyInput, node)) visitStep(step, steps);
    orders.set(node, Object.freeze(steps));
  }

  function visitStep(step: CsharpNativeOperandStep, steps: CsharpNativeOrderStep[], visited?: ReadonlyMap<CsharpNativeChildUse, VisitedUse>): void {
    if (step.kind === "construct") {
      visitConstruct(step.node);
      steps.push(Object.freeze({ kind: "construct", construct: step.node }));
    } else {
      const child = visited?.get(step.use) ?? visitUse(step.use);
      steps.push(Object.freeze({ kind: "use", site: child.site }));
    }
  }

  function visitUse(child: CsharpNativeChildUse, exact?: TargetUseSiteRef): VisitedUse {
    let site = exact ?? csharpNativeUseSite(child.owner, child.slot, child.context);
    const expression = child.expression;
    if (exact === undefined) {
      const candidates = slots.get(site.subject)?.get(site.role);
      const matching = candidates?.expressions.get(expression) ?? [];
      if (matching.length > 1) return pending(site, expression, "use-context-unresolved");
      if (matching.length === 1 && candidates?.pending.length === 0) site = matching[0]!.site;
      else if (candidates !== undefined && candidates.pending.length > 0) {
        const refusals = candidates.pending.filter(entry => entry.expression === expression);
        if (refusals.length === 1) return pending(refusals[0]!.site, expression, "expected-use-pending", refusals[0]!.message);
        return pending(site, expression, "expected-use-pending");
      }
    }
    let owner = states.get(site.subject);
    if (owner === undefined) { owner = new Map(); states.set(site.subject, owner); }
    const identity = targetUseSiteIdentity(site);
    const existing = owner.get(identity);
    if (existing !== undefined) {
      if (existing.expression !== expression) failTargetAnalysisInvariant("tsonic-csharp", `Native use identity '${site.role}' names different expressions.`, expression);
      return existing.state === "visiting" ? pending(site, expression, "cyclic-use") : existing.visited;
    }
    const unresolved = Object.freeze({ site, expression, completion: undefined });
    owner.set(identity, { expression, state: "visiting", visited: unresolved });
    const result = evaluate(child, site);
    owner.set(identity, { expression, state: "closed", visited: result });
    if (result.completion?.kind === "value") {
      if (child.slot.kind === "initializer" && ast.is.IsVariableDeclaration(child.owner) ||
        child.slot.kind === "operand" && child.slot.position === "only" &&
          (ast.is.IsForOfStatement(child.owner) || ast.is.IsForInStatement(child.owner))) requiredBindingRoots.add(child.owner);
      if (child.slot.kind === "operand" && child.slot.position === "right") {
        const operation = input.operations.binaryOperation.get(child.owner)?.target;
        if (operation?.kind === "resolved" && operation.sourceOperator === "=" ||
          input.operations.operatorForm.get(child.owner) === "destructuring-assignment") requiredBindingRoots.add(child.owner);
      }
    }
    return result;
  }

  function evaluate(child: CsharpNativeChildUse, site: TargetUseSiteRef): VisitedUse {
    const expression = child.expression;
    if (input.evidence.compileTimeMetadata.get(expression) || input.participation.get(expression) === "erased") {
      return publish(site, { kind: "erased", expression, cause: "discarded-callable" });
    }
    const expected = input.expected.expectedUse.get(site);
    const withheld = exactPending.get(site.subject)?.get(targetUseSiteIdentity(site));
    if (withheld !== undefined) return pending(site, expression, "expected-use-pending", withheld.message);
    requireCsharpRecord(requiredRecords, { family: "sourceArgument", subject: expression,
      construct: "native expression passing", producer: "analyzeCsharpNativeDemand" });
    if (ast.is.IsArrowFunction(expression) || ast.is.IsFunctionExpression(expression)) requireCsharpRecord(requiredRecords, {
      family: "callableTarget", subject: expression, construct: "native callable creation", producer: "analyzeCsharpNativeDemand",
    });
    if (expected?.literal !== undefined) requireCsharpRecord(requiredRecords, {
      family: "exactLiteral", subject: expression, target: expected.target,
      construct: "native literal construction", producer: "analyzeCsharpNativeDemand",
    });
    const selected: CsharpNativeOperandSelection = expected?.literal === undefined
      ? selectCsharpNativeOperandUses(policyInput, expression, child.access)
      : Object.freeze({ runtime: Object.freeze([]), planning: Object.freeze([]), flow: "sequence", carrier: expected.carrier });
    const expectedChildren = new Map<string, TargetUseSiteRef[]>();
    for (const reference of expected?.construction?.children ?? expected?.children ?? []) {
      const matching = expectedChildren.get(reference.role) ?? [];
      matching.push(reference); expectedChildren.set(reference.role, matching);
    }
    const visited = new Map<CsharpNativeChildUse, VisitedUse>();
    const runtime: { readonly child: CsharpNativeChildUse; readonly visited: VisitedUse }[] = [];
    let stopped = false;
    for (const operand of selected.runtime) {
      if (stopped) break;
      const reference = expectedChildren.get(csharpNativeUseSite(operand.owner, operand.slot).role);
      const exact = reference?.length === 1 && reference[0]!.subject === operand.owner ? reference[0] : undefined;
      const result = visitUse(operand, exact);
      visited.set(operand, result); runtime.push({ child: operand, visited: result });
      if (selected.flow === "sequence" && operand.guard === undefined && result.completion?.kind === "never") stopped = true;
      if ((selected.flow === "conditional" || selected.flow === "short-circuit") && runtime.length === 1 && result.completion?.kind === "never") stopped = true;
    }
    const steps: CsharpNativeOrderStep[] = [];
    const runtimeUses = new Set(selected.runtime);
    for (const step of selected.planning) {
      if (step.kind === "use" && runtimeUses.has(step.use) && !visited.has(step.use)) continue;
      visitStep(step, steps, visited);
    }
    if (!orders.has(expression)) orders.set(expression, Object.freeze(steps));
    if (selected.flow === "sequence" && runtime.length === 1 &&
      (ast.is.IsParenthesizedExpression(expression) || ast.is.IsSatisfiesExpression(expression)) &&
      published.get(runtime[0]!.visited.site.subject)?.get(targetUseSiteIdentity(runtime[0]!.visited.site))?.kind === "erased") {
      return publish(site, { kind: "erased", expression, cause: "discarded-callable" });
    }
    if (selected.refusal !== undefined) return pending(site, expression, selected.refusal, selected.refusalMessage, selected.refusalCode);
    if (expected === undefined && child.context?.target !== undefined &&
      (selected.carrier === undefined || !targetTypeRefEquals(child.context.target, selected.carrier))) return pending(site, expression, "expected-use-pending");
    const physical = expected?.carrier ?? selected.carrier;
    const flow = completionFlow(selected, runtime);
    if (flow === undefined || physical === undefined) return pending(site, expression, "completion-unresolved");
    const inputCompletion = selectCsharpNativeCompletion(physical, flow);
    if (inputCompletion === undefined) return pending(site, expression, "completion-unresolved");
    let propertyKeys: readonly CsharpNativePropertyKey[] | undefined;
    if (ast.is.IsObjectLiteralExpression(expression) && isCsharpRecordDictionaryTargetType(physical) && inputCompletion.kind !== "never") {
      const bindings = input.propertyKeyBindings(expression, physical);
      if (bindings === undefined) return failTargetAnalysisInvariant("tsonic-csharp", "A native dictionary requires its exact property-key bindings.", expression);
      const keys: CsharpNativePropertyKey[] = [];
      for (const binding of bindings) {
        const literal = input.exactLiteral.get(binding.name, binding.target, "property-key");
        if (literal?.kind === "rejected") return pending(site, expression, "property-key-refused", literal.reason);
        if (literal?.kind !== "resolved") return failTargetAnalysisInvariant("tsonic-csharp", "A native dictionary key requires its selected exact literal recipe.", binding.name);
        requireCsharpRecord(requiredRecords, { family: "exactLiteral", subject: binding.name, target: binding.target,
          role: "property-key",
          construct: "native dictionary key", producer: "analyzeCsharpNativeDemand" });
        keys.push(Object.freeze({ ...binding, literal: literal.recipe }));
      }
      propertyKeys = Object.freeze(keys);
    }
    const evaluation = evaluationOf(selected, runtime);
    if (evaluation === undefined) return pending(site, expression, "completion-unresolved");
    const projections: TargetUseSiteRef[] = [];
    const operation = expected?.binary ?? input.operations.binaryOperation.get(expression)?.target;
    if (operation?.kind === "resolved" && operation.targetOperation.kind === "conditional-value" &&
      operation.targetOperation.branch !== "right" && runtime[0]?.visited.completion?.kind === "value") {
      const references = expected === undefined
        ? slots.get(expression)?.get("present-payload")?.expressions.get(operation.left)?.map(entry => entry.site) ?? []
        : expectedChildren.get("present-payload") ?? [];
      if (references.length !== 1) return pending(site, expression, "use-context-unresolved");
      const reference = references[0]!;
      const projection = input.expected.expectedUse.get(reference);
      if (projection === undefined) return pending(reference, operation.left, "expected-use-pending");
      const completion: CsharpNativeCompletion = Object.freeze({ kind: "value", type: projection.carrier });
      const native = { expression: operation.left, carrier: projection.carrier, children: Object.freeze([]),
        evaluation: Object.freeze({ kind: "sequence" as const, steps: Object.freeze([]) }) };
      if (projection.representation === "convert") publish(reference, { ...native, kind: "converted", input: completion,
        target: projection.target, mode: projection.mode, completion: Object.freeze({ kind: "value", type: projection.target }) });
      else publish(reference, { ...native, kind: "forwarded", completion });
      projections.push(reference);
    }
    const children = Object.freeze([...runtime.map(entry => entry.visited.site), ...projections]);
    const defaultValue = child.slot.kind !== "default" ? undefined : ast.is.IsParameterDeclaration(child.owner)
      ? input.declarations.runtimeDefault.get(child.owner)?.native : input.bindingPatterns.bindingPatternProjection.get(child.owner)?.defaultValue;
    const objectShape = !ast.is.IsObjectLiteralExpression(expression) ? undefined : expected === undefined
      ? input.objectShapes.resolveTarget(physical) : expected.objectShape;
    if (expected?.construction !== undefined) {
      publish(expected.construction.site, { kind: "constructed", expression, carrier: expected.construction.carrier,
        children, evaluation, completion: inputCompletion, objectShape: expected.objectShape, propertyKeys });
      const stage = expected.construction.site;
      const completion = selectCsharpNativeCompletion(expected.target, { kind: "sequence", children: [{ completion: inputCompletion }] });
      if (completion === undefined) return pending(site, expression, "completion-unresolved");
      return publish(site, { kind: "converted", expression, carrier: physical, input: inputCompletion, target: expected.target, mode: expected.mode,
        children: Object.freeze([stage]), evaluation: Object.freeze({ kind: "sequence", steps: Object.freeze([Object.freeze({ site: stage })]) }),
        objectShape, defaultValue, propertyKeys, completion });
    }
    const common = { expression, carrier: physical, children, evaluation, completion: inputCompletion,
      ...(expected?.literal === undefined ? {} : { literal: expected.literal }),
      ...(expected?.binary === undefined ? {} : { binary: expected.binary }),
      ...(objectShape === undefined ? {} : { objectShape }),
      ...(propertyKeys === undefined ? {} : { propertyKeys }),
      ...(defaultValue === undefined ? {} : { defaultValue }) };
    if (expected?.representation === "convert") {
      const completion = selectCsharpNativeCompletion(expected.target, { kind: "sequence", children: [{ completion: inputCompletion }] });
      return completion === undefined ? pending(site, expression, "completion-unresolved")
        : publish(site, { ...common, kind: "converted", input: inputCompletion, target: expected.target, mode: expected.mode, completion });
    }
    if (expected !== undefined) return publish(site, { ...common, kind: expected.representation === "construct" ? "constructed" : "forwarded" });
    if (child.access === "location") return publish(site, { ...common, kind: "location" });
    return child.slot.kind === "effect" ? publish(site, { ...common, kind: "effect" })
      : publish(site, { ...common, kind: "value", handler: input.operations.nativeHandler.get(expression) });
  }
}

interface NativeRuntimeChild {
  readonly child: CsharpNativeChildUse;
  readonly visited: VisitedUse;
}

function completionFlow(selected: CsharpNativeOperandSelection, runtime: readonly NativeRuntimeChild[]): CsharpNativeCompletionFlow | undefined {
  if (selected.flow === "creation") return { kind: "creation" };
  if (selected.flow === "conditional") return { kind: "conditional", condition: runtime[0]?.visited.completion,
    whenTrue: runtime[1]?.visited.completion, whenFalse: runtime[2]?.visited.completion };
  if (selected.flow === "short-circuit") return { kind: "short-circuit", left: runtime[0]?.visited.completion, right: runtime[1]?.visited.completion };
  return { kind: "sequence", children: runtime.map(entry => ({ completion: entry.visited.completion, guarded: entry.child.guard !== undefined })) };
}

function evaluationOf(selected: CsharpNativeOperandSelection, runtime: readonly NativeRuntimeChild[]): CsharpNativeEvaluation | undefined {
  if (selected.flow === "creation") return Object.freeze({ kind: "creation" });
  if (runtime.length === 1 && runtime[0]!.visited.completion?.kind === "never") return Object.freeze({ kind: "sequence",
    steps: Object.freeze([Object.freeze({ site: runtime[0]!.visited.site })]) });
  if (selected.flow === "conditional") return runtime.length === 3 ? Object.freeze({ kind: "conditional", condition: runtime[0]!.visited.site,
    whenTrue: runtime[1]!.visited.site, whenFalse: runtime[2]!.visited.site }) : undefined;
  if (selected.flow === "short-circuit") return runtime.length === 2 ? Object.freeze({ kind: "short-circuit", left: runtime[0]!.visited.site,
    right: runtime[1]!.visited.site }) : undefined;
  return Object.freeze({ kind: "sequence", steps: Object.freeze(runtime.map(entry => Object.freeze({ site: entry.visited.site, guard: entry.child.guard }))) });
}
