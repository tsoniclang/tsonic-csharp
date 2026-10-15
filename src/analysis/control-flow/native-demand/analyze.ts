import type { Node } from "@tsonic/tsts";
import {
  createTargetClassificationKey,
  createTargetUseClassificationBuilder,
  type TargetUseSiteRef,
} from "@tsonic/target-api/analysis";
import {
  csharpNativeUseSite,
  type CsharpNativeCompletion,
  type CsharpNativeUse,
  type CsharpNativeUseClassifications,
} from "../../../target-model/records/native-demand.js";
import { csharpNativeCarrierCompletion, csharpNativeOrderedCompletion } from "./completion.js";
import type { CsharpNativeDemandAnalysisInput } from "./model.js";
import {
  csharpNativeBaseCallUses,
  csharpNativeExpressionChildUses,
  csharpNativeOperandsConditional,
  csharpNativeOwnCarrier,
  csharpNativeOperandsStopAfterNever,
  csharpNativeStatementChildUses,
  isCsharpNativeExpression,
  type CsharpNativeChildUse,
} from "./operations.js";

export interface CsharpNativeUseEntry {
  readonly site: TargetUseSiteRef;
  readonly use: CsharpNativeUse;
}

const nativeUseKey = createTargetClassificationKey<CsharpNativeUse>("csharp.native-demand.use");

export function analyzeCsharpNativeDemand(input: CsharpNativeDemandAnalysisInput): CsharpNativeUseClassifications {
  const builder = createTargetUseClassificationBuilder();
  for (const entry of collectCsharpNativeUses(input)) {
    if (builder.set(entry.site, nativeUseKey, entry.use).kind === "conflict") {
      throw new Error(`Conflicting native use for role '${entry.site.role}'.`);
    }
  }
  const uses = builder.seal();
  return Object.freeze({ nativeUse: Object.freeze({ get: (site: TargetUseSiteRef) => uses.get(site, nativeUseKey) }) });
}

export function collectCsharpNativeUses(input: CsharpNativeDemandAnalysisInput): readonly CsharpNativeUseEntry[] {
  const { ast, operations, evidence, attributeApplications } = input;
  const entries: CsharpNativeUseEntry[] = [];
  for (const sourceFile of input.sourceFiles) visitDeclarations(sourceFile, undefined);
  return Object.freeze(entries);

  function publish(site: TargetUseSiteRef, nativeUse: CsharpNativeUse): void {
    entries.push(Object.freeze({ site, use: Object.freeze(nativeUse) }));
  }

  function visitDeclarations(node: Node, skippedStatement: Node | undefined): void {
    if (evidence.compileTimeMetadata.get(node) || operations.nativeUnreachable.get(node)) return;
    const participation = isCallable(node) ? input.participation.get(node) : undefined;
    if (participation === "erased") return;
    if (ast.is.IsExpressionStatement(node) && operations.erasedStatement.get(node)) {
      const expression = ast.as.AsExpressionStatement(node)?.Expression;
      if (expression !== undefined) {
        publish(csharpNativeUseSite(node, { kind: "effect" }), { kind: "erased", expression, cause: "erased-statement" });
      }
      return;
    }
    for (const [index, application] of attributeApplications.attributeApplication.get(node).entries()) {
      visitUse({ owner: node, expression: application.invocation, slot: { kind: "attribute-invocation", index } });
    }
    if (participation === "signature") {
      for (const parameter of ast.parameters(node)) if (parameter !== undefined) visitDeclarations(parameter, undefined);
      return;
    }
    let skipped = skippedStatement;
    if (ast.is.IsConstructorDeclaration(node)) {
      const base = csharpNativeBaseCallUses(input, node);
      for (const baseUse of base.arguments) visitUse(baseUse);
      skipped = base.statement;
    }
    for (const child of csharpNativeStatementChildUses(input, node)) visitUse(child);
    ast.forEachChild(node, (child) => {
      if (child === undefined || child === skipped || isCsharpNativeExpression(ast, child)) return;
      visitDeclarations(child, skipped);
    });
  }

  function visitUse(child: CsharpNativeChildUse): CsharpNativeCompletion | undefined {
    const site = csharpNativeUseSite(child.owner, child.slot);
    const expression = child.expression;
    if (evidence.compileTimeMetadata.get(expression)) return undefined;
    if (isCallable(expression) && input.participation.get(expression) === "erased") {
      publish(site, { kind: "erased", expression, cause: "discarded-callable" });
      return undefined;
    }
    const children = admittedChildren(expression, csharpNativeExpressionChildUses(input, expression));
    const own = csharpNativeCarrierCompletion(csharpNativeOwnCarrier(input, expression));
    const ordered = csharpNativeOperandsConditional(ast, expression) ? children.completions.slice(0, 1) : children.completions;
    const completion = isCallable(expression) ? own : csharpNativeOrderedCompletion(ordered, own);
    if (isCallable(expression) || ast.is.IsClassExpression(expression)) visitBody(expression);
    if (ast.is.IsObjectLiteralExpression(expression)) {
      for (const member of ast.children(expression)) if (member !== undefined && isCallable(member)) visitDeclarations(member, undefined);
    }
    const childSites = Object.freeze(children.admitted.map(entry => csharpNativeUseSite(entry.owner, entry.slot)));
    const expected = input.expectedUse.get(site);
    if (completion === undefined) return undefined;
    if (expected !== undefined) {
      if (expected.representation === "convert") {
        publish(site, { kind: "converted", expression, input: completion, target: expected.target, mode: expected.mode, children: childSites,
          completion: completion.kind === "never" ? completion : csharpNativeCarrierCompletion(expected.target) ?? completion });
      } else {
        publish(site, { kind: expected.representation === "construct" ? "constructed" : "forwarded", expression,
          children: expected.representation === "forward" ? expected.children : childSites, completion });
      }
      return completion;
    }
    if (child.slot.kind === "effect") {
      publish(site, { kind: "effect", expression, children: childSites, completion });
      return completion;
    }
    const handler = ast.is.IsCallExpression(expression) ? operations.nativeHandler.get(expression) : undefined;
    publish(site, { kind: "value", expression, ...(handler === undefined ? {} : { handler }), children: childSites, completion });
    return completion;
  }

  function admittedChildren(expression: Node, uses: readonly CsharpNativeChildUse[]): {
    readonly admitted: readonly CsharpNativeChildUse[];
    readonly completions: readonly (CsharpNativeCompletion | undefined)[];
  } {
    const sequential = csharpNativeOperandsStopAfterNever(input, expression);
    const admitted: CsharpNativeChildUse[] = [];
    const completions: (CsharpNativeCompletion | undefined)[] = [];
    for (const entry of uses) {
      if (sequential && completions.some(completion => completion?.kind === "never")) break;
      admitted.push(entry);
      completions.push(visitUse(entry));
    }
    return { admitted, completions };
  }

  function visitBody(callable: Node): void {
    ast.forEachChild(callable, (child) => {
      if (child === undefined || isCsharpNativeExpression(ast, child)) return;
      visitDeclarations(child, undefined);
    });
  }

  function isCallable(node: Node): boolean {
    return ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node) || ast.is.IsFunctionDeclaration(node) ||
      ast.is.IsMethodDeclaration(node) || ast.is.IsConstructorDeclaration(node) || ast.is.IsGetAccessorDeclaration(node) ||
      ast.is.IsSetAccessorDeclaration(node);
  }
}
