import type { Node } from "@tsonic/tsts";
import { sourceEnclosingCallable, sourceExpressionCallArgument, sourceCallArgumentCorrespondences,
  type SourceFileSemantics, type SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { CsharpTypePolicyBaseHost } from "../source-evidence/types/resolution/model.js";
import type { ResolvedSourceCallInfo } from "../../target-model/records/calls/source-calls.js";

export type CsharpLiteralContextHost = Pick<CsharpTypePolicyBaseHost, "ast" | "navigation" | "semanticsFor">;

export interface CsharpLiteralContext {
  readonly authority: "own" | "later-use" | "inferred";
  readonly component: SourceTypeComponentEvidence;
  readonly declarations: readonly Node[];
  readonly source: Node;
  readonly returnedFrom?: Node;
  readonly argument?: {
    readonly source: ResolvedSourceCallInfo;
    readonly correspondence: NonNullable<ReturnType<typeof sourceCallArgumentCorrespondences>>[number];
    readonly excludedSourceArgumentIndexes: ReadonlySet<number>;
  };
}

export interface CsharpLiteralCreationSource {
  readonly expression: Node;
  readonly queries: SourceFileSemantics;
  readonly contexts: readonly CsharpLiteralContext[];
  readonly uncontextualizedArguments: readonly NonNullable<CsharpLiteralContext["argument"]>[];
  readonly untypedReturns: readonly Node[];
  readonly declarations: readonly Node[];
  readonly blocked: boolean;
}

export interface CsharpLiteralCreationSelection extends CsharpLiteralContext {
  readonly creation: CsharpLiteralCreationSource;
}

export function selectCsharpLiteralCreationContext(
  observed: CsharpLiteralCreationSource,
): CsharpLiteralCreationSelection | undefined {
  const first = observed.contexts[0];
  if (observed.blocked || observed.uncontextualizedArguments.length !== 0 || observed.untypedReturns.length !== 0 ||
    first === undefined || observed.contexts.some(context =>
    context.component.selectedType !== first.component.selectedType ||
    context.component.declaration !== first.component.declaration ||
    context.component.authoredTypeNode !== first.component.authoredTypeNode ||
    context.component.contextualCall !== first.component.contextualCall ||
    context.argument?.correspondence.binding !== first.argument?.correspondence.binding ||
    context.returnedFrom !== first.returnedFrom)) return undefined;
  return Object.freeze({ creation: observed, authority: first.authority, component: first.component, declarations: first.declarations, source: first.source,
    ...(first.argument === undefined ? {} : { argument: first.argument }),
    ...(first.returnedFrom === undefined ? {} : { returnedFrom: first.returnedFrom }) });
}

export function formCsharpLiteralCreationSource(
  expression: Node,
  queries: SourceFileSemantics,
  host: CsharpLiteralContextHost,
): CsharpLiteralCreationSource {
  const { ast, navigation } = host;
  const uncontextualizedArguments: NonNullable<CsharpLiteralContext["argument"]>[] = [];
  const untypedReturns: Node[] = [];
  const observed = (contexts: readonly CsharpLiteralContext[], declarations: readonly Node[], blocked = false):
    CsharpLiteralCreationSource => Object.freeze({ expression, queries,
      contexts: Object.freeze(contexts.map(context => Object.freeze({ ...context,
        declarations: Object.freeze(context.declarations) }))),
      uncontextualizedArguments: Object.freeze(uncontextualizedArguments),
      untypedReturns: Object.freeze(untypedReturns), declarations: Object.freeze(declarations), blocked });
  const callArgument = (reference: Node, declarations: readonly Node[]): CsharpLiteralContext["argument"] => {
    const argument = sourceExpressionCallArgument(reference, { ast, semantics: { forNode: host.semanticsFor } });
    if (argument === undefined) return undefined;
    const semantics = host.semanticsFor(argument.call);
    const source = semantics.operations.call(argument.call);
    const bindings = source === undefined ? undefined : sourceCallArgumentCorrespondences({ ast, semantics }, source)?.filter(row =>
      row.binding.sourceArgumentIndex === argument.argumentIndex && row.binding.sourceForm === "value");
    if (source === undefined || bindings?.length !== 1) return undefined;
    const excludedSourceArgumentIndexes = new Set([argument.argumentIndex]);
    for (const [index, input] of source.sourceArguments.entries()) {
      let expression = input.expression;
      while (ast.is.IsParenthesizedExpression(expression) || ast.is.IsSatisfiesExpression(expression)) {
        const operand = ast.is.IsParenthesizedExpression(expression) ? ast.as.AsParenthesizedExpression(expression)?.Expression
          : ast.as.AsSatisfiesExpression(expression)?.Expression;
        if (operand === undefined) break;
        expression = operand;
      }
      const declaration = navigation.referenceFor(expression)?.declaration;
      if (declaration !== undefined && declarations.includes(declaration)) excludedSourceArgumentIndexes.add(index);
    }
    return Object.freeze({ source, correspondence: bindings[0]!, excludedSourceArgumentIndexes });
  };
  const selfDerivedArgument = (argument: NonNullable<CsharpLiteralContext["argument"]>): boolean => {
    const authoredTypeNode = argument.correspondence.parameter.authoredTypeNode;
    const declared = authoredTypeNode === undefined ? undefined
      : host.semanticsFor(authoredTypeNode).types.authoredType(authoredTypeNode);
    return declared !== undefined && argument.source.sourceSelectedMethodTypeArguments?.some(binding =>
      binding.typeParameter === declared && binding.explicitTypeNode === undefined) === true;
  };
  let current = expression;
  while (ast.is.IsParenthesizedExpression(ast.parent(current))) current = ast.parent(current)!;
  const declaration = ast.parent(current);
  const variable = declaration !== undefined && ast.is.IsVariableDeclaration(declaration)
    ? ast.as.AsVariableDeclaration(declaration) : undefined;
  let inheritedDeclarationContext = false;
  if (ast.is.IsObjectLiteralExpression(expression)) {
    let initializer = current;
    let owner = declaration;
    while (owner !== undefined && !ast.is.IsVariableDeclaration(owner)) {
      const property = ast.is.IsPropertyAssignment(owner) && ast.as.AsPropertyAssignment(owner)?.Initializer === initializer;
      const literal = property ? ast.parent(owner)
        : ast.is.IsArrayLiteralExpression(owner) && ast.elements(owner).includes(initializer) ? owner : undefined;
      if (literal === undefined || property && !ast.is.IsObjectLiteralExpression(literal)) break;
      const contextual = host.semanticsFor(literal).types.contextualValueSelection(literal);
      inheritedDeclarationContext ||= contextual.kind === "selected" &&
        (contextual.component.authoredTypeNode !== undefined || contextual.component.contextualCall !== undefined);
      initializer = literal;
      while (ast.is.IsParenthesizedExpression(ast.parent(initializer))) initializer = ast.parent(initializer)!;
      owner = ast.parent(initializer);
    }
    const binding = owner !== undefined && ast.is.IsVariableDeclaration(owner)
      ? ast.as.AsVariableDeclaration(owner) : undefined;
    inheritedDeclarationContext ||= binding?.Initializer === initializer && binding.Type !== undefined;
    if (owner !== undefined && ast.is.IsReturnStatement(owner) && ast.as.AsReturnStatement(owner)?.Expression === initializer) {
      const callable = sourceEnclosingCallable(owner, ast);
      inheritedDeclarationContext ||= callable !== undefined && ast.typeNode(callable) !== undefined;
    }
    if (binding?.Initializer === initializer && binding.Type !== undefined &&
      ast.is.IsObjectBindingPattern(ast.name(owner!))) {
      const selectedType = queries.types.expressionType(expression);
      return selectedType === undefined ? observed([], [], true) : observed([
        { authority: "own", component: { selectedType, declaration: owner }, declarations: [], source: expression },
      ], []);
    }
  }
  const declarations = variable?.Initializer === current ? [declaration!] : [];
  const returnContext = (callable: Node, locals: readonly Node[], source: Node,
    authority: "own" | "later-use"): CsharpLiteralContext | undefined => {
    const argument = callArgument(callable, locals);
    const authoredTypeNode = ast.typeNode(callable);
    if (authoredTypeNode !== undefined) {
      const selectedType = host.semanticsFor(authoredTypeNode).types.authoredType(authoredTypeNode);
      return selectedType === undefined ? undefined : { authority,
        component: { selectedType, authoredTypeNode, declaration: callable },
        declarations: locals, source, returnedFrom: callable, argument };
    }
    const callableQueries = host.semanticsFor(callable);
    const contextual = callableQueries.types.contextualValueSelection(callable);
    const signature = contextual.kind === "selected" ? callableQueries.types.callable(contextual.component.selectedType) : undefined;
    return signature === undefined ? undefined : { authority: authority === "later-use" ? authority
      : contextual.kind === "selected" && (contextual.component.authoredTypeNode !== undefined ||
        contextual.component.contextualCall !== undefined) ? "own" : "inferred",
      component: signature.result, declarations: locals, source, returnedFrom: callable, argument };
  };
  const parent = ast.parent(current);
  const returning = parent !== undefined && ast.is.IsReturnStatement(parent) ||
    parent !== undefined && (ast.is.IsArrowFunction(parent) || ast.is.IsFunctionExpression(parent)) && ast.body(parent) === current;
  if (returning) {
    const callable = parent !== undefined && (ast.is.IsArrowFunction(parent) || ast.is.IsFunctionExpression(parent))
      ? parent : sourceEnclosingCallable(expression, ast);
    const selected = callable === undefined ? undefined : returnContext(callable, declarations, expression, "own");
    if (selected !== undefined) return observed([selected], declarations);
    untypedReturns.push(expression);
    return observed([], declarations);
  }
  const direct = queries.types.contextualValueSelection(expression);
  const ownContext = direct.kind === "selected" && (direct.component.authoredTypeNode !== undefined ||
    direct.component.contextualCall !== undefined || inheritedDeclarationContext);
  if (direct.kind === "selected" && (ownContext || declarations.length === 0)) {
    const argument = callArgument(expression, declarations);
    return observed(argument !== undefined && selfDerivedArgument(argument) ? [] : [{
      authority: ownContext ? "own" : "inferred", component: direct.component, declarations, source: expression, argument,
    }], declarations);
  }
  const flow = navigation.expressionValueFlow(expression);
  const locals = flow.aliasDeclarations.filter(local => ast.typeNode(local) === undefined);
  const contexts: CsharpLiteralContext[] = [];
  let blocked = false;
  for (const local of flow.aliasDeclarations) {
    if (!ast.is.IsVariableDeclaration(local)) {
      blocked = true;
      continue;
    }
    const authoredTypeNode = ast.typeNode(local);
    const summary = navigation.declarationUseSummary(local);
    if (authoredTypeNode === undefined) {
      if (ast.variableDeclarationKind(ast.parent(local)) !== "const" || summary.bindingWritten || summary.exported) blocked = true;
      continue;
    }
    const selectedType = host.semanticsFor(authoredTypeNode).types.authoredType(authoredTypeNode);
    const source = ast.as.AsVariableDeclaration(local)?.Initializer;
    if (selectedType === undefined || source === undefined) blocked = true;
    else contexts.push({ authority: "later-use", component: { selectedType, authoredTypeNode, declaration: local },
      declarations: locals, source });
  }
  for (const use of flow.uses) {
    if (use.kind === "type-only") continue;
    const origin = navigation.referenceFor(use.reference)?.declaration;
    if (origin !== undefined && ast.typeNode(origin) !== undefined) continue;
    if (use.captured || use.kind === "source-linkage") {
      blocked = true;
      continue;
    }
    if (use.role === "argument") {
      const argument = callArgument(use.reference, flow.aliasDeclarations);
      if (argument === undefined) {
        blocked = true;
        continue;
      }
      const call = argument.source;
      const selected = argument.correspondence;
      const callQueries = host.semanticsFor(call.call);
      if (selfDerivedArgument(argument)) continue;
      const checked = host.semanticsFor(selected.argument.expression).types.contextualValueSelection(selected.argument.expression);
      if (checked.kind !== "selected") {
        uncontextualizedArguments.push(argument);
        continue;
      }
      const parameterTypes = callQueries.types.isUnion(selected.binding.selectedParameterType)
        ? callQueries.types.unionOrIntersectionTypes(selected.binding.selectedParameterType).filter(type => !callQueries.types.isNullish(type))
        : [selected.binding.selectedParameterType];
      if (checked.component.contextualCall !== call ||
        checked.component.selectedType !== selected.binding.selectedParameterType &&
        (parameterTypes.length !== 1 || checked.component.selectedType !== parameterTypes[0])) {
        blocked = true;
        continue;
      }
      contexts.push({ authority: "later-use", component: checked.component,
        declarations: locals, source: selected.argument.expression, argument });
      continue;
    }
    if (use.role === "return") {
      const callable = sourceEnclosingCallable(use.reference, ast);
      const selected = callable === undefined ? undefined : returnContext(callable, locals, use.reference, "later-use");
      if (selected === undefined) untypedReturns.push(use.reference);
      else contexts.push(selected);
      continue;
    }
    if (use.role === "storage") {
      if (flow.storedOutsideBinding) blocked = true;
      continue;
    }
    if (use.role !== "comparison" && use.role !== "condition" && use.role !== "receiver" &&
      !(use.role === "write" && use.throughMember)) blocked = true;
  }
  return observed(contexts, locals, blocked || flow.exported && flow.aliasDeclarations.length === 0);
}
