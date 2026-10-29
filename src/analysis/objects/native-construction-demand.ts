import { providerVirtualDeclarationFactKey, type Node, type SourceFile, type Type } from "@tsonic/tsts";
import { sourceDeclarationIsModuleScoped, sourceEnclosingCallable,
  type SourceFileSemantics, type SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpNullableTargetType } from "../../target-model/types/carriers/nullable.js";
import { createCsharpMetadataBudget } from "../../target-model/metadata/immutable.js";
import type { CsharpTypePolicyBaseHost } from "../source-evidence/types/resolution/model.js";
import { csharpNativeConstructionMembersMatch } from "./native-construction-members.js";
import { createCsharpObjectShapeValueStorage } from "../../policy/types/objects/shape-carriers.js";
import type { CsharpNativeConstructionDemandQueries, CsharpNativeConstructionIssue,
  CsharpNativeConstructionSelection } from "../../target-model/records/native/native-construction.js";
import type { CsharpObjectLiteralTargetShapeResolution } from "../../target-model/records/objects/object-shapes.js";
import { createCsharpNativeConstructionRecords } from "../program/records/native/native-construction.js";

type LiteralContextHost = Pick<CsharpTypePolicyBaseHost, "ast" | "navigation" | "semanticsFor">;

interface CsharpLiteralContext {
  readonly component: SourceTypeComponentEvidence;
  readonly declarations: readonly Node[];
  readonly source: Node;
  readonly returnedFrom?: Node;
}

export function selectCsharpLiteralDeclarationContext(
  expression: Node,
  queries: SourceFileSemantics,
  host: LiteralContextHost,
): CsharpLiteralContext | undefined {
  const { ast, navigation } = host;
  let current = expression;
  while (ast.is.IsParenthesizedExpression(ast.parent(current))) current = ast.parent(current)!;
  const declaration = ast.parent(current);
  const variable = declaration !== undefined && ast.is.IsVariableDeclaration(declaration)
    ? ast.as.AsVariableDeclaration(declaration) : undefined;
  const declarations = variable?.Initializer === current ? [declaration!] : [];
  const returnContext = (callable: Node, locals: readonly Node[]): CsharpLiteralContext | undefined => {
    const authoredTypeNode = ast.typeNode(callable);
    if (authoredTypeNode !== undefined) {
      const selectedType = host.semanticsFor(authoredTypeNode).types.authoredType(authoredTypeNode);
      return selectedType === undefined ? undefined : { component: { selectedType, authoredTypeNode, declaration: callable },
        declarations: locals, source: expression, returnedFrom: callable };
    }
    const callableQueries = host.semanticsFor(callable);
    const contextual = callableQueries.types.contextualValueSelection(callable);
    const signature = contextual.kind === "selected" ? callableQueries.types.callable(contextual.component.selectedType) : undefined;
    return signature === undefined ? undefined : { component: signature.result, declarations: locals,
      source: expression, returnedFrom: callable };
  };
  const parent = ast.parent(current);
  const returning = parent !== undefined && ast.is.IsReturnStatement(parent) ||
    parent !== undefined && (ast.is.IsArrowFunction(parent) || ast.is.IsFunctionExpression(parent)) && ast.body(parent) === current;
  if (returning) {
    const callable = parent !== undefined && (ast.is.IsArrowFunction(parent) || ast.is.IsFunctionExpression(parent))
      ? parent : sourceEnclosingCallable(expression, ast);
    const selected = callable === undefined ? undefined : returnContext(callable, declarations);
    if (selected !== undefined) return selected;
  }
  const direct = queries.types.contextualValueSelection(expression);
  if (direct.kind === "selected") return { component: direct.component, declarations, source: expression };
  if (declarations.length === 0) return undefined;
  const list = ast.parent(declaration!);
  const statement = ast.parent(list);
  const block = ast.parent(statement);
  if (list === undefined || statement === undefined || block === undefined ||
    !ast.is.IsVariableDeclarationList(list) || !ast.is.IsVariableStatement(statement) ||
    !ast.is.IsBlock(block)) return undefined;
  const siblings = ast.children(block).filter((node): node is Node => node !== undefined);
  const position = siblings.indexOf(statement);
  if (position < 0) return undefined;
  let binding = declaration!;
  for (let alias = 0; alias < 2; alias += 1) {
    const next = siblings[position + alias + 1];
    if (next === undefined) return undefined;
    const immediate = ast.is.IsReturnStatement(next) ? ast.as.AsReturnStatement(next)?.Expression
      : ast.is.IsExpressionStatement(next) ? ast.as.AsExpressionStatement(next)?.Expression : undefined;
    const call = immediate !== undefined && ast.is.IsCallExpression(immediate) ? ast.as.AsCallExpression(immediate) : undefined;
    if (call !== undefined) {
      for (const argument of call.Arguments?.Nodes ?? []) {
        if (argument === undefined || !ast.is.IsIdentifier(argument) ||
          navigation.referenceFor(argument)?.declaration !== binding) continue;
        const checked = host.semanticsFor(argument).types.contextualValueSelection(argument);
        if (checked.kind === "selected") return { component: checked.component, declarations, source: argument };
      }
      return undefined;
    }
    if (ast.is.IsReturnStatement(next)) {
      const returned = ast.as.AsReturnStatement(next)?.Expression;
      if (returned === undefined || !ast.is.IsIdentifier(returned) ||
        navigation.referenceFor(returned)?.declaration !== binding) return undefined;
      const callable = sourceEnclosingCallable(next, ast);
      return callable === undefined ? undefined : returnContext(callable, declarations);
    }
    if (!ast.is.IsVariableStatement(next)) return undefined;
    const nextList = ast.as.AsVariableStatement(next)?.DeclarationList;
    const variables = nextList === undefined ? [] : ast.children(nextList).filter((node): node is Node =>
      node !== undefined && ast.is.IsVariableDeclaration(node));
    const nextDeclaration = variables.length === 1 ? variables[0] : undefined;
    const nextVariable = nextDeclaration === undefined ? undefined : ast.as.AsVariableDeclaration(nextDeclaration);
    const initializer = nextVariable?.Initializer;
    if (initializer === undefined || !ast.is.IsIdentifier(initializer) ||
      navigation.referenceFor(initializer)?.declaration !== binding) return undefined;
    const authoredTypeNode = nextVariable?.Type;
    if (authoredTypeNode !== undefined) {
      const selectedType = host.semanticsFor(authoredTypeNode).types.authoredType(authoredTypeNode);
      return selectedType === undefined ? undefined : { component: { selectedType, authoredTypeNode,
        declaration: nextDeclaration }, declarations, source: expression };
    }
    if (alias !== 0) return undefined;
    binding = nextDeclaration!;
    declarations.push(binding);
  }
  return undefined;
}

interface CsharpNativeConstructionHost extends Pick<CsharpTypePolicyBaseHost,
  "ast" | "navigation" | "providers" | "sourceFacts" | "sourceFiles" | "semanticsFor"> {
  resolveShape(type: Type, file: SourceFile, authoredTypeRoot?: Node): CsharpObjectShapeFact | undefined;
  resolveLiteralShape(shape: CsharpObjectShapeFact, node: Node, file: SourceFile): CsharpObjectLiteralTargetShapeResolution;
  retainSourceShape(node: Node, type: Type, shape: CsharpObjectShapeFact, file: SourceFile): CsharpObjectShapeFact | undefined;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
}

export function createCsharpNativeConstructionDemandQuery(
  host: CsharpNativeConstructionHost,
): CsharpNativeConstructionDemandQueries {
  const constructions = new Map<Node, CsharpNativeConstructionSelection>();
  const issues: CsharpNativeConstructionIssue[] = [];
  const issue = (node: Node, code: CsharpNativeConstructionIssue["code"], message: string): void => {
    issues.push(Object.freeze({ node, code, message }));
  };
  const publish = (node: Node, shape: CsharpObjectShapeFact): void => {
    const queries = host.semanticsFor(node);
    const source = queries.types.expressionType(node);
    const members = source === undefined ? [] : queries.types.isUnion(source)
      ? queries.types.unionOrIntersectionTypes(source).filter(type => !queries.types.isNullish(type)) : [source];
    if (members.length !== 1) return;
    const existing = host.scopedTargetType(node);
    if (existing !== undefined && !targetTypeRefEquals(existing, shape.targetType)) {
      const original = host.resolveShape(members[0]!, queries.sourceFile, node);
      if (original === undefined || !targetTypeRefEquals(existing, original.targetType)) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          "Native construction conflicts with an exact selected source storage carrier.");
        return;
      }
    }
    const retained = host.retainSourceShape(node, members[0]!, shape, queries.sourceFile);
    if (retained === undefined) {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
        "Native construction has no exact source-member correspondence for its declared storage.");
      return;
    }
    const targetType = source !== members[0] ? csharpNullableTargetType(retained.targetType) : retained.targetType;
    constructions.set(node, Object.freeze({ targetType, shape: retained }));
  };
  const select = (node: Node): void => {
    if (!host.navigation.isProjectDeclaration(node)) return;
    const queries = host.semanticsFor(node);
    const source = queries.types.expressionType(node);
    if (source === undefined || queries.types.constructSignatures(source).length !== 0) return;
    const context = selectCsharpLiteralDeclarationContext(node, queries, host);
    const contextual = context?.component.selectedType;
    const asynchronous = context?.returnedFrom !== undefined && host.ast.hasModifierKind(context.returnedFrom, "async");
    const selected = contextual !== undefined && asynchronous ? queries.types.typeArguments(contextual)[0] : contextual;
    if (selected !== undefined && queries.types.isAny(selected)) {
      issue(node, "TSONIC_ANY_UNSUPPORTED", "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
      return;
    }
    if (host.ast.properties(node).length === 0 && selected === undefined) {
      issue(node, "TSONIC_UNTYPED_OBJECT_LITERAL",
        "This object literal has no target type. Declare one, e.g. 'function baseOptions(): MakeDirectoryOptions'.");
      return;
    }
    const native = selected !== undefined && queries.facts.typeSubjects(selected).some(subject => {
      const fact = host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey);
      if (fact === undefined) return false;
      const provider = host.providers.resolveType(fact);
      return provider.kind === "resolved" && provider.relations.some(relation =>
        relation.kind === "type" && relation.objectLiteralConstruction?.kind === "object-initializer");
    });
    if (native && selected !== undefined) {
      const shape = host.resolveShape(selected, queries.sourceFile, asynchronous ? undefined : context?.component.authoredTypeNode);
      const original = host.resolveShape(source, queries.sourceFile, node);
      const budget = createCsharpMetadataBudget();
      if (shape === undefined || !csharpNativeConstructionMembersMatch(source, original, shape, queries, host, budget.reserve)) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          "The declared native construction cannot retain all exact fields, absence and native storage without a copied or adapted object.");
        return;
      }
      publish(node, shape);
      for (const declaration of context?.declarations ?? []) {
        publish(declaration, shape);
        for (const reference of host.navigation.referencesToDeclaration(declaration)) publish(reference, shape);
      }
      return;
    }
    if (selected !== undefined && !queries.types.isUnknown(selected)) {
      const expected = host.resolveShape(selected, queries.sourceFile, asynchronous ? undefined : context?.component.authoredTypeNode);
      const resolved = expected === undefined ? undefined : host.resolveLiteralShape(expected, node, queries.sourceFile);
      if (resolved?.kind === "rejected") {
        issue(resolved.subject, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", resolved.reason);
        return;
      }
      if (resolved?.kind === "resolved") {
        publish(node, resolved.shape);
        for (const declaration of context?.declarations ?? []) {
          publish(declaration, resolved.shape);
          for (const reference of host.navigation.referencesToDeclaration(declaration)) publish(reference, resolved.shape);
        }
        return;
      }
    }
    if (context !== undefined) return;
    const declaration = host.ast.parent(node);
    const variable = declaration === undefined || !host.ast.is.IsVariableDeclaration(declaration)
      ? undefined : host.ast.as.AsVariableDeclaration(declaration);
    if (variable?.Initializer === node) selectLocalValue(declaration!, source, node);
  };
  const selectLocalValue = (declaration: Node, source: Type, expression?: Node): void => {
    if (sourceDeclarationIsModuleScoped(declaration, host.ast)) return;
    const queries = host.semanticsFor(declaration);
    const summary = host.navigation.declarationUseSummary(declaration);
    if (summary.bindingWritten || summary.memberWritten || summary.identityCompared || summary.aliasedOrStored ||
      summary.exported || summary.hasUnclassifiedValueUse || summary.conditionallyRead ||
      summary.escapeKinds.some(kind => kind !== "capture") || summary.uses.length === 0 ||
      summary.uses.some(use => use.kind !== "type-only" && (use.role !== "receiver" || !use.throughMember))) return;
    const original = host.resolveShape(source, queries.sourceFile, expression ?? declaration);
    const existing = host.scopedTargetType(declaration);
    if (original === undefined || existing !== undefined && !targetTypeRefEquals(existing, original.targetType)) return;
    const shape = createCsharpObjectShapeValueStorage(original);
    if (shape === undefined) return;
    if (expression !== undefined) publish(expression, shape);
    publish(declaration, shape);
    for (const reference of host.navigation.referencesToDeclaration(declaration)) publish(reference, shape);
  };
  const visit = (node: Node): void => {
    host.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    if (host.ast.is.IsObjectLiteralExpression(node)) select(node);
    if (host.ast.is.IsBindingElement(node) && host.ast.as.AsBindingElement(node)?.DotDotDotToken !== undefined &&
      host.ast.is.IsObjectBindingPattern(host.ast.parent(node)) && host.navigation.isProjectDeclaration(node)) {
      const source = host.semanticsFor(node).types.expressionType(node);
      if (source !== undefined) selectLocalValue(node, source);
    }
  };
  for (const sourceFile of host.sourceFiles) visit(sourceFile);
  return createCsharpNativeConstructionRecords(constructions, issues);
}
