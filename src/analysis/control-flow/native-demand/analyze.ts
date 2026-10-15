import type { Node } from "@tsonic/tsts";
import {
  createTargetClassificationKey,
  createTargetUseClassificationBuilder,
  type TargetUseSiteRef,
} from "@tsonic/target-api/analysis";
import {
  csharpNativeUseSite,
  type CsharpNativeCompletion,
  type CsharpNativeOrderStep,
  type CsharpNativeUse,
} from "../../../target-model/records/native-demand.js";
import { csharpNativeCarrierCompletion, csharpNativeOrderedCompletion } from "./completion.js";
import type { CsharpNativeDemandAnalysis, CsharpNativeDemandAnalysisInput, CsharpNativeUnadmittedUse } from "./model.js";
import {
  csharpNativeConstructSteps,
  csharpNativeExpressionChildUses,
  csharpNativeOperandsConditional,
  csharpNativeOwnCarrier,
  csharpNativeOperandsStopAfterNever,
  type CsharpNativeChildUse,
} from "./operations.js";

export interface CsharpNativeUseEntry {
  readonly site: TargetUseSiteRef;
  readonly use: CsharpNativeUse;
}

export interface CsharpNativeDemand {
  readonly entries: readonly CsharpNativeUseEntry[];
  readonly unadmitted: readonly CsharpNativeUnadmittedUse[];
  readonly order: (construct: Node) => readonly CsharpNativeOrderStep[] | undefined;
}

interface VisitedUse {
  readonly site: TargetUseSiteRef;
  readonly completion: CsharpNativeCompletion | undefined;
  readonly required: boolean;
}

interface AdmittedChild {
  readonly child: CsharpNativeChildUse;
  readonly visited: VisitedUse;
}

const nativeUseKey = createTargetClassificationKey<CsharpNativeUse>("csharp.native-demand.use");

export function analyzeCsharpNativeDemand(input: CsharpNativeDemandAnalysisInput): CsharpNativeDemandAnalysis {
  const demand = collectCsharpNativeDemand(input);
  const builder = createTargetUseClassificationBuilder();
  for (const entry of demand.entries) {
    if (builder.set(entry.site, nativeUseKey, entry.use).kind === "conflict") {
      throw new Error(`Conflicting native use for role '${entry.site.role}'.`);
    }
  }
  const uses = builder.seal();
  return Object.freeze({
    nativeUse: Object.freeze({
      get: (site: TargetUseSiteRef) => uses.get(site, nativeUseKey),
      order: demand.order,
    }),
    unadmitted: demand.unadmitted,
  });
}

export function collectCsharpNativeUses(input: CsharpNativeDemandAnalysisInput): readonly CsharpNativeUseEntry[] {
  return collectCsharpNativeDemand(input).entries;
}

export function collectCsharpNativeDemand(input: CsharpNativeDemandAnalysisInput): CsharpNativeDemand {
  const { ast, operations, evidence } = input;
  const entries: CsharpNativeUseEntry[] = [];
  const unadmitted: CsharpNativeUnadmittedUse[] = [];
  const orders = new Map<Node, readonly CsharpNativeOrderStep[]>();
  for (const sourceFile of input.sourceFiles) visitConstruct(sourceFile, undefined);
  return Object.freeze({ entries: Object.freeze(entries), unadmitted: Object.freeze(unadmitted),
    order: (construct: Node) => orders.get(construct) });

  function publish(site: TargetUseSiteRef, nativeUse: CsharpNativeUse): VisitedUse {
    entries.push(Object.freeze({ site, use: Object.freeze(nativeUse) }));
    return { site, completion: nativeUse.kind === "erased" ? undefined : nativeUse.completion, required: true };
  }

  function leaveUnadmitted(site: TargetUseSiteRef, expression: Node, reason: CsharpNativeUnadmittedUse["reason"]): VisitedUse {
    unadmitted.push(Object.freeze({ site, expression, reason }));
    return { site, completion: undefined, required: true };
  }

  function useStep(site: TargetUseSiteRef): CsharpNativeOrderStep {
    return Object.freeze({ kind: "use", site });
  }

  function visitConstruct(node: Node, parent: CsharpNativeOrderStep[] | undefined): void {
    if (evidence.compileTimeMetadata.get(node) || operations.nativeUnreachable.get(node)) return;
    const participation = isCallable(node) ? input.participation.get(node) : undefined;
    if (participation === "erased") return;
    parent?.push(Object.freeze({ kind: "construct", construct: node }));
    const steps: CsharpNativeOrderStep[] = [];
    if (ast.is.IsExpressionStatement(node) && operations.erasedStatement.get(node)) {
      const expression = ast.as.AsExpressionStatement(node)?.Expression;
      if (expression !== undefined) {
        steps.push(useStep(publish(csharpNativeUseSite(node, { kind: "effect" }),
          { kind: "erased", expression, cause: "erased-statement" }).site));
      }
    } else {
      visitSteps(node, participation === "signature", steps);
    }
    orders.set(node, Object.freeze(steps));
  }

  function visitSteps(node: Node, signatureOnly: boolean, steps: CsharpNativeOrderStep[]): void {
    for (const step of csharpNativeConstructSteps(input, node, signatureOnly)) {
      if (step.kind === "construct") {
        visitConstruct(step.node, steps);
        continue;
      }
      const visited = visitUse(step.use);
      if (visited.required) steps.push(useStep(visited.site));
    }
  }

  function visitUse(child: CsharpNativeChildUse): VisitedUse {
    const site = csharpNativeUseSite(child.owner, child.slot);
    const expression = child.expression;
    if (evidence.compileTimeMetadata.get(expression)) return { site, completion: undefined, required: false };
    if (isCallable(expression) && input.participation.get(expression) === "erased") {
      return publish(site, { kind: "erased", expression, cause: "discarded-callable" });
    }
    const childUses = csharpNativeExpressionChildUses(input, expression);
    const children = admittedChildren(expression, childUses.runtime);
    recordRecipe(expression, childUses.planning, children);
    if (childUses.refusal !== undefined) return leaveUnadmitted(site, expression, childUses.refusal);
    const own = csharpNativeCarrierCompletion(csharpNativeOwnCarrier(input, expression));
    const completions = children.map(entry => entry.visited.completion);
    const ordered = csharpNativeOperandsConditional(ast, expression) ? completions.slice(0, 1) : completions;
    const completion = isCallable(expression) ? own : csharpNativeOrderedCompletion(ordered, own);
    const childSites = Object.freeze(children.filter(entry => entry.visited.required).map(entry => entry.visited.site));
    const expected = input.expectedUse.get(site);
    if (expected?.representation === "construct") {
      const constructed = completion ?? csharpNativeCarrierCompletion(expected.target);
      if (constructed !== undefined) return publish(site, { kind: "constructed", expression, children: childSites, completion: constructed });
    }
    if (completion === undefined) return leaveUnadmitted(site, expression, "completion-unresolved");
    if (expected?.representation === "convert") {
      return publish(site, { kind: "converted", expression, input: completion, target: expected.target, mode: expected.mode, children: childSites,
        completion: completion.kind === "never" ? completion : csharpNativeCarrierCompletion(expected.target) ?? completion });
    }
    if (expected?.representation === "forward") {
      return publish(site, { kind: "forwarded", expression, children: expected.children, completion });
    }
    if (child.slot.kind === "effect") return publish(site, { kind: "effect", expression, children: childSites, completion });
    const handler = ast.is.IsCallExpression(expression) ? operations.nativeHandler.get(expression) : undefined;
    return publish(site, { kind: "value", expression, ...(handler === undefined ? {} : { handler }), children: childSites, completion });
  }

  function admittedChildren(expression: Node, uses: readonly CsharpNativeChildUse[]): readonly AdmittedChild[] {
    const sequential = csharpNativeOperandsStopAfterNever(input, expression);
    const admitted: AdmittedChild[] = [];
    for (const child of uses) {
      if (sequential && admitted.some(entry => entry.visited.completion?.kind === "never")) break;
      admitted.push({ child, visited: visitUse(child) });
    }
    return admitted;
  }

  function recordRecipe(expression: Node, planning: readonly CsharpNativeChildUse[], children: readonly AdmittedChild[]): void {
    const visited = new Map(children.map(entry => [entry.child, entry.visited]));
    const childStep = (child: CsharpNativeChildUse): readonly CsharpNativeOrderStep[] => {
      const entry = visited.get(child);
      return entry?.required === true ? [useStep(entry.site)] : [];
    };
    const steps: CsharpNativeOrderStep[] = [];
    if (isCallable(expression)) {
      for (const step of csharpNativeConstructSteps(input, expression, false)) {
        if (step.kind === "construct") visitConstruct(step.node, steps);
      }
      for (const child of planning) steps.push(...childStep(child));
    } else if (ast.is.IsObjectLiteralExpression(expression)) {
      ast.children(expression).forEach((member, index) => {
        if (member === undefined) return;
        if (isCallable(member)) {
          visitConstruct(member, steps);
          return;
        }
        const child = planning.find(candidate => candidate.slot.kind === "member" && candidate.slot.index === index);
        if (child !== undefined) steps.push(...childStep(child));
      });
    } else {
      for (const child of planning) steps.push(...childStep(child));
    }
    orders.set(expression, Object.freeze(steps));
  }

  function isCallable(node: Node): boolean {
    return ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node) || ast.is.IsFunctionDeclaration(node) ||
      ast.is.IsMethodDeclaration(node) || ast.is.IsConstructorDeclaration(node) || ast.is.IsGetAccessorDeclaration(node) ||
      ast.is.IsSetAccessorDeclaration(node);
  }
}
