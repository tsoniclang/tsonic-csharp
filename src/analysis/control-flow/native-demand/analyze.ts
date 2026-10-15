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
  type CsharpNativeUseClassifications,
} from "../../../target-model/records/native-demand.js";
import { csharpNativeCarrierCompletion, csharpNativeOrderedCompletion } from "./completion.js";
import type { CsharpNativeDemandAnalysisInput } from "./model.js";
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
  readonly order: (construct: Node) => readonly CsharpNativeOrderStep[] | undefined;
}

interface VisitedUse {
  readonly site: TargetUseSiteRef;
  readonly completion: CsharpNativeCompletion | undefined;
  readonly published: boolean;
}

interface AdmittedChild {
  readonly child: CsharpNativeChildUse;
  readonly visited: VisitedUse;
}

const nativeUseKey = createTargetClassificationKey<CsharpNativeUse>("csharp.native-demand.use");

export function analyzeCsharpNativeDemand(input: CsharpNativeDemandAnalysisInput): CsharpNativeUseClassifications {
  const demand = collectCsharpNativeDemand(input);
  const builder = createTargetUseClassificationBuilder();
  for (const entry of demand.entries) {
    if (builder.set(entry.site, nativeUseKey, entry.use).kind === "conflict") {
      throw new Error(`Conflicting native use for role '${entry.site.role}'.`);
    }
  }
  const uses = builder.seal();
  return Object.freeze({ nativeUse: Object.freeze({
    get: (site: TargetUseSiteRef) => uses.get(site, nativeUseKey),
    order: demand.order,
  }) });
}

export function collectCsharpNativeUses(input: CsharpNativeDemandAnalysisInput): readonly CsharpNativeUseEntry[] {
  return collectCsharpNativeDemand(input).entries;
}

export function collectCsharpNativeDemand(input: CsharpNativeDemandAnalysisInput): CsharpNativeDemand {
  const { ast, operations, evidence } = input;
  const entries: CsharpNativeUseEntry[] = [];
  const orders = new Map<Node, readonly CsharpNativeOrderStep[]>();
  for (const sourceFile of input.sourceFiles) visitConstruct(sourceFile, undefined);
  return Object.freeze({ entries: Object.freeze(entries), order: (construct: Node) => orders.get(construct) });

  function publish(site: TargetUseSiteRef, nativeUse: CsharpNativeUse): void {
    entries.push(Object.freeze({ site, use: Object.freeze(nativeUse) }));
  }

  function useStep(site: TargetUseSiteRef): CsharpNativeOrderStep {
    return Object.freeze({ kind: "use", site });
  }

  function visitConstruct(node: Node, parent: CsharpNativeOrderStep[] | undefined): void {
    if (evidence.compileTimeMetadata.get(node) || operations.nativeUnreachable.get(node)) return;
    const participation = isCallable(node) ? input.participation.get(node) : undefined;
    if (participation === "erased") return;
    const steps: CsharpNativeOrderStep[] = [];
    parent?.push(Object.freeze({ kind: "construct", construct: node }));
    orders.set(node, steps);
    if (ast.is.IsExpressionStatement(node) && operations.erasedStatement.get(node)) {
      const expression = ast.as.AsExpressionStatement(node)?.Expression;
      if (expression !== undefined) {
        const site = csharpNativeUseSite(node, { kind: "effect" });
        publish(site, { kind: "erased", expression, cause: "erased-statement" });
        steps.push(useStep(site));
      }
      Object.freeze(steps);
      return;
    }
    for (const step of csharpNativeConstructSteps(input, node, participation === "signature")) {
      if (step.kind === "construct") {
        visitConstruct(step.node, steps);
        continue;
      }
      const visited = visitUse(step.use);
      if (visited.published) steps.push(useStep(visited.site));
    }
    Object.freeze(steps);
  }

  function visitUse(child: CsharpNativeChildUse): VisitedUse {
    const site = csharpNativeUseSite(child.owner, child.slot);
    const expression = child.expression;
    if (evidence.compileTimeMetadata.get(expression)) return { site, completion: undefined, published: false };
    if (isCallable(expression) && input.participation.get(expression) === "erased") {
      publish(site, { kind: "erased", expression, cause: "discarded-callable" });
      return { site, completion: undefined, published: true };
    }
    const children = admittedChildren(expression, csharpNativeExpressionChildUses(input, expression));
    const own = csharpNativeCarrierCompletion(csharpNativeOwnCarrier(input, expression));
    const completions = children.map(entry => entry.visited.completion);
    const ordered = csharpNativeOperandsConditional(ast, expression) ? completions.slice(0, 1) : completions;
    const completion = isCallable(expression) ? own : csharpNativeOrderedCompletion(ordered, own);
    if (isCallable(expression)) visitConstruct(expression, undefined);
    if (ast.is.IsObjectLiteralExpression(expression)) visitObjectLiteralOrder(expression, children);
    if (completion === undefined) return { site, completion, published: false };
    const childSites = Object.freeze(children.filter(entry => entry.visited.published).map(entry => entry.visited.site));
    const expected = input.expectedUse.get(site);
    if (expected !== undefined) {
      if (expected.representation === "convert") {
        publish(site, { kind: "converted", expression, input: completion, target: expected.target, mode: expected.mode, children: childSites,
          completion: completion.kind === "never" ? completion : csharpNativeCarrierCompletion(expected.target) ?? completion });
      } else {
        publish(site, { kind: expected.representation === "construct" ? "constructed" : "forwarded", expression,
          children: expected.representation === "forward" ? expected.children : childSites, completion });
      }
      return { site, completion, published: true };
    }
    if (child.slot.kind === "effect") {
      publish(site, { kind: "effect", expression, children: childSites, completion });
      return { site, completion, published: true };
    }
    const handler = ast.is.IsCallExpression(expression) ? operations.nativeHandler.get(expression) : undefined;
    publish(site, { kind: "value", expression, ...(handler === undefined ? {} : { handler }), children: childSites, completion });
    return { site, completion, published: true };
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

  function visitObjectLiteralOrder(expression: Node, children: readonly AdmittedChild[]): void {
    const members = ast.children(expression);
    if (!members.some(member => member !== undefined && isCallable(member))) return;
    const steps: CsharpNativeOrderStep[] = [];
    members.forEach((member, index) => {
      if (member === undefined) return;
      if (isCallable(member)) {
        visitConstruct(member, steps);
        return;
      }
      const entry = children.find(candidate => candidate.child.slot.kind === "member" && candidate.child.slot.index === index);
      if (entry?.visited.published) steps.push(useStep(entry.visited.site));
    });
    orders.set(expression, Object.freeze(steps));
  }

  function isCallable(node: Node): boolean {
    return ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node) || ast.is.IsFunctionDeclaration(node) ||
      ast.is.IsMethodDeclaration(node) || ast.is.IsConstructorDeclaration(node) || ast.is.IsGetAccessorDeclaration(node) ||
      ast.is.IsSetAccessorDeclaration(node);
  }
}
