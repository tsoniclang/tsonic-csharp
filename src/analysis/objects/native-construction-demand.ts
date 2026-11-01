import { providerVirtualDeclarationFactKey, type Node, type SourceFile, type Type } from "@tsonic/tsts";
import { sourceCallArgumentCorrespondences, sourceDeclarationIsModuleScoped, sourceEnclosingCallable, sourceExpressionCallArgument,
  type SourceFileSemantics, type SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpNullableTargetType } from "../../target-model/types/carriers/nullable.js";
import { createCsharpMetadataBudget, maximumCsharpMetadataEntries } from "../../target-model/metadata/immutable.js";
import type { CsharpTypePolicyBaseHost, CsharpTypePolicyHost } from "../source-evidence/types/resolution/model.js";
import { csharpNativeConstructionMembersMatch } from "./native-construction-members.js";
import { createCsharpObjectShapeValueStorage } from "../../policy/types/objects/shape-carriers.js";
import type { CsharpNativeConstructionDemandQueries, CsharpNativeConstructionIssue,
  CsharpNativeConstructionSelection } from "../../target-model/records/native/native-construction.js";
import type { CsharpObjectLiteralTargetShapeResolution } from "../../target-model/records/objects/object-shapes.js";
import { createCsharpNativeConstructionRecords } from "../program/records/native/native-construction.js";

type LiteralContextHost = Pick<CsharpTypePolicyBaseHost, "ast" | "navigation" | "semanticsFor"> &
  Pick<CsharpTypePolicyHost, "selectTargetCall">;

interface CsharpLiteralUseContext {
  readonly component: SourceTypeComponentEvidence;
  readonly source: Node;
  readonly returnedFrom?: Node;
}

interface CsharpLiteralContext extends CsharpLiteralUseContext {
  readonly kind: "selected";
  readonly declarations: readonly Node[];
  readonly identityUses: readonly CsharpLiteralUseContext[];
  readonly opaqueUses: readonly Node[];
}

interface CsharpLiteralContextRejection {
  readonly kind: "rejected";
  readonly subject: Node;
  readonly reason: string;
}

export function selectCsharpLiteralDeclarationContext(
  expression: Node,
  queries: SourceFileSemantics,
  host: LiteralContextHost,
): CsharpLiteralContext | CsharpLiteralContextRejection | undefined {
  const { ast, navigation } = host;
  const selected = (use: CsharpLiteralUseContext, declarations: readonly Node[], opaqueUses: readonly Node[],
    identityUses: readonly CsharpLiteralUseContext[] = [use]): CsharpLiteralContext =>
    ({ kind: "selected", ...use, declarations, identityUses, opaqueUses });
  let current = expression;
  while (ast.is.IsParenthesizedExpression(ast.parent(current))) current = ast.parent(current)!;
  const declaration = ast.parent(current);
  const variable = declaration !== undefined && ast.is.IsVariableDeclaration(declaration)
    ? ast.as.AsVariableDeclaration(declaration) : undefined;
  if (ast.is.IsObjectLiteralExpression(expression)) {
    let initializer = current;
    let owner = declaration;
    while (owner !== undefined && !ast.is.IsVariableDeclaration(owner)) {
      if (!ast.is.IsPropertyAssignment(owner) || ast.as.AsPropertyAssignment(owner)?.Initializer !== initializer) break;
      const literal = ast.parent(owner);
      if (literal === undefined || !ast.is.IsObjectLiteralExpression(literal)) break;
      initializer = literal;
      while (ast.is.IsParenthesizedExpression(ast.parent(initializer))) initializer = ast.parent(initializer)!;
      owner = ast.parent(initializer);
    }
    const binding = owner !== undefined && ast.is.IsVariableDeclaration(owner)
      ? ast.as.AsVariableDeclaration(owner) : undefined;
    if (binding?.Initializer === initializer && binding.Type !== undefined &&
      ast.is.IsObjectBindingPattern(ast.name(owner!))) {
      const selectedType = queries.types.expressionType(expression);
      return selectedType === undefined ? undefined : selected({ component: { selectedType, declaration: owner },
        source: expression }, [], []);
    }
  }
  const declarations = variable?.Initializer === current ? [declaration!] : [];
  const returnContext = (callable: Node, source: Node): CsharpLiteralUseContext | undefined => {
    const authoredTypeNode = ast.typeNode(callable);
    if (authoredTypeNode !== undefined) {
      const selectedType = host.semanticsFor(authoredTypeNode).types.authoredType(authoredTypeNode);
      return selectedType === undefined ? undefined : { component: { selectedType, authoredTypeNode, declaration: callable },
        source, returnedFrom: callable };
    }
    const callableQueries = host.semanticsFor(callable);
    const contextual = callableQueries.types.contextualValueSelection(callable);
    const signature = contextual.kind === "selected" ? callableQueries.types.callable(contextual.component.selectedType) : undefined;
    return signature === undefined ? undefined : { component: signature.result, source, returnedFrom: callable };
  };
  const parent = ast.parent(current);
  const returning = parent !== undefined && ast.is.IsReturnStatement(parent) ||
    parent !== undefined && (ast.is.IsArrowFunction(parent) || ast.is.IsFunctionExpression(parent)) && ast.body(parent) === current;
  if (returning) {
    const callable = parent !== undefined && (ast.is.IsArrowFunction(parent) || ast.is.IsFunctionExpression(parent))
      ? parent : sourceEnclosingCallable(expression, ast);
    const use = callable === undefined ? undefined : returnContext(callable, expression);
    if (use !== undefined) return selected(use, declarations, []);
  }
  const direct = queries.types.contextualValueSelection(expression);
  if (direct.kind === "selected") return selected({ component: direct.component, source: expression }, declarations, []);
  const enclosing = parent !== undefined && ast.is.IsPropertyAssignment(parent)
    ? ast.parent(parent) : parent;
  if (enclosing !== undefined && (ast.is.IsArrayLiteralExpression(enclosing) ||
    parent !== undefined && ast.is.IsPropertyAssignment(parent) && ast.is.IsObjectLiteralExpression(enclosing))) {
    const enclosingQueries = host.semanticsFor(enclosing);
    const enclosingContext = selectCsharpLiteralDeclarationContext(enclosing, enclosingQueries, host);
    if (enclosingContext?.kind === "rejected") return enclosingContext;
    const identityUses = (enclosingContext?.identityUses ?? []).flatMap((use): CsharpLiteralUseContext[] => {
      const type = use.returnedFrom !== undefined && ast.hasModifierKind(use.returnedFrom, "async")
        ? enclosingQueries.types.typeArguments(use.component.selectedType)[0] : use.component.selectedType;
      if (type === undefined || enclosingQueries.types.isUnknown(type) || enclosingQueries.types.isAny(type)) return [];
      if (ast.is.IsArrayLiteralExpression(enclosing)) {
        const index = ast.elements(enclosing).indexOf(current);
        const element = enclosingQueries.types.isTuple(type) ? enclosingQueries.types.tupleElementTypes(type)[index]
          : enclosingQueries.types.isArrayLike(type) ? enclosingQueries.types.typeArguments(type)[0] : undefined;
        return element === undefined ? [] : [{ component: { selectedType: element }, source: expression }];
      }
      const source = enclosingQueries.types.expressionType(enclosing);
      const correspondence = source === undefined ? undefined : enclosingQueries.types.structuralMembers(source, type, "read");
      const member = correspondence?.kind === "available" ? correspondence.members.find(member =>
        member.kind === "present" && member.source.declarations.includes(parent!)) : undefined;
      return member?.kind !== "present" ? [] : [{ component: { selectedType: member.destination.property.type }, source: expression }];
    });
    if (identityUses[0] !== undefined) return selected(identityUses[0], [], enclosingContext?.opaqueUses ?? [], identityUses);
  }
  if (declarations.length === 0) return undefined;
  const list = ast.parent(declaration!);
  if (list === undefined || !ast.is.IsVariableDeclarationList(list)) return undefined;
  const checked = queries.types.expressionType(expression);
  if (checked === undefined) return undefined;
  const flow = navigation.expressionValueFlow(expression);
  const typedSlots = new Set(flow.aliasDeclarations.filter(alias => alias !== declaration &&
    ast.variableDeclarationKind(alias) !== "const" && ast.typeNode(alias) !== undefined));
  const aliases = new Set(flow.aliasDeclarations.filter(alias => !typedSlots.has(alias)));
  const name = ast.name(declaration!);
  const binding = name !== undefined && ast.is.IsIdentifier(name) ? ast.text(name) : "value";
  const reject = (use: Node, reason: string): CsharpLiteralContextRejection => ({ kind: "rejected", subject: expression,
    reason: `${ast.is.IsObjectLiteralExpression(expression) ? csharpUntypedObjectLiteralIssue(expression, ast).message : `Annotate 'const ${binding}' with the exact native element type.`} Native construction ${reason} at source offset ${ast.pos(use)}.` });
  if (flow.yielded) {
    return reject(expression, "escapes its closed const-alias use set");
  }
  for (const alias of aliases) {
    if (alias !== declaration && ast.variableDeclarationKind(alias) !== "const" || navigation.declarationUseSummary(alias).bindingWritten) {
      return reject(alias, "has a mutable alias outside its closed representation contract");
    }
  }
  const identityUses: CsharpLiteralUseContext[] = flow.exported
    ? [{ component: { selectedType: checked }, source: expression }] : [];
  const opaqueUses: Node[] = flow.exported ? [expression] : [];
  const opaqueType = (type: Type, semantics: SourceFileSemantics): boolean => {
    if (semantics.types.isAny(type) || semantics.types.isUnknown(type) || semantics.types.isNonPrimitive(type)) return true;
    const symbol = semantics.declarations.typeSymbol(semantics.types.nonNullableType(type) ?? type);
    const declarations = symbol === undefined ? [] : semantics.declarations.symbolDeclarations(symbol);
    return !declarations.some(declaration => ast.is.IsClassDeclaration(declaration) || ast.is.IsInterfaceDeclaration(declaration));
  };
  for (const use of flow.uses) {
    const owner = navigation.referenceFor(use.reference)?.declaration;
    if (owner !== undefined && typedSlots.has(owner)) continue;
    if (use.kind === "type-only" || use.throughMember || use.role === "condition") continue;
    let reference = use.reference;
    while (ast.is.IsParenthesizedExpression(ast.parent(reference))) reference = ast.parent(reference)!;
    const parent = ast.parent(reference);
    if (parent !== undefined && (ast.is.IsVoidExpression(parent) || ast.is.IsTypeOfExpression(parent))) continue;
    if (use.role === "receiver" && parent !== undefined &&
      (ast.is.IsSpreadElement(parent) || ast.is.IsSpreadAssignment(parent) ||
        ast.is.IsForOfStatement(parent) || ast.is.IsForInStatement(parent))) continue;
    if (use.role === "storage" && parent !== undefined && aliases.has(parent) && ast.typeNode(parent) === undefined) continue;
    if (use.role === "return") {
      const callable = sourceEnclosingCallable(reference, ast);
      const context = callable === undefined ? undefined : returnContext(callable, reference)
        ?? { component: { selectedType: checked }, source: reference };
      if (context === undefined) return reject(reference, "has an unresolved return identity use");
      if (opaqueType(context.component.selectedType, host.semanticsFor(reference))) opaqueUses.push(reference);
      if (!queries.types.isUnknown(context.component.selectedType) && !queries.types.isAny(context.component.selectedType)) identityUses.push(context);
      continue;
    }
    if (use.role === "comparison" && parent !== undefined && ast.is.IsBinaryExpression(parent)) {
      const binary = ast.as.AsBinaryExpression(parent);
      const other = binary?.Left === reference ? binary.Right : binary?.Left;
      const owner = other === undefined ? undefined : navigation.referenceFor(other)?.declaration;
      const otherType = other === undefined ? undefined : host.semanticsFor(other).types.expressionType(other);
      if (owner !== undefined && aliases.has(owner) || otherType !== undefined && queries.types.isNullish(otherType)) continue;
      if (otherType !== undefined) {
        identityUses.push({ component: { selectedType: otherType }, source: reference });
        continue;
      }
    }
    const argument = use.role === "argument" ? sourceExpressionCallArgument(reference,
      { ast, semantics: { forNode: host.semanticsFor } }) : undefined;
    const callQueries = argument === undefined ? undefined : host.semanticsFor(argument.call);
    const call = argument === undefined ? undefined : callQueries?.operations.call(argument.call);
    const rows = call === undefined || callQueries === undefined ? undefined
      : sourceCallArgumentCorrespondences({ ast, semantics: callQueries }, call)?.filter(row =>
        row.binding.sourceArgumentIndex === argument!.argumentIndex && row.binding.sourceForm === "value");
    const context = call !== undefined && rows?.length === 1
      ? selected({ component: { selectedType: rows[0]!.binding.selectedParameterType, contextualCall: call },
        source: reference }, [], [])
      : selectCsharpLiteralDeclarationContext(reference, host.semanticsFor(reference), host);
    if (context?.kind === "rejected") return context;
    if (context === undefined) return reject(reference, "has an unresolved identity use");
    if (use.role === "storage" && parent !== undefined && aliases.has(parent) &&
      queries.types.isNonPrimitive(context.component.selectedType)) continue;
    const target = argument === undefined || callQueries === undefined ? undefined
      : host.selectTargetCall(argument.call, callQueries.sourceFile);
    const projected = target?.kind !== "resolved" ? [] : target.call.arguments.filter(selected =>
      selected.sourceArgumentIndex === argument!.argumentIndex && selected.sourceForm === "value");
    if (projected.length === 1 && projected[0]!.targetParameter.csharpAcceptsClosedSourceArgument === true &&
      projected[0]!.targetParameter.csharpValueProjection === "properties") continue;
    const formal = rows?.length === 1 ? rows[0]!.parameter.authoredTypeNode : undefined;
    const authored = formal === undefined ? undefined : host.semanticsFor(formal).types.authoredType(formal);
    const inferred = authored === undefined ? undefined : call?.sourceSelectedMethodTypeArguments?.find(binding =>
      binding.explicitTypeNode === undefined && binding.typeParameter === authored &&
      callQueries!.types.isIdentical(binding.selectedType, rows![0]!.binding.selectedArgumentType));
    if (inferred === undefined && opaqueType(context.component.selectedType, host.semanticsFor(reference))) opaqueUses.push(reference);
    opaqueUses.push(...context.opaqueUses);
    if (!queries.types.isUnknown(context.component.selectedType) && !queries.types.isAny(context.component.selectedType)) {
      identityUses.push(...context.identityUses);
    }
  }
  const first = identityUses[0] ?? { component: { selectedType: checked }, source: expression };
  return selected(first, [...aliases], opaqueUses, identityUses);
}

interface CsharpNativeConstructionHost extends Pick<CsharpTypePolicyHost, "selectTargetCall">, Pick<CsharpTypePolicyBaseHost,
  "ast" | "navigation" | "providers" | "sourceFacts" | "sourceFiles" | "semanticsFor"> {
  resolveShape(type: Type, file: SourceFile, authoredTypeRoot?: Node): CsharpObjectShapeFact | undefined;
  resolveLiteralShape(shape: CsharpObjectShapeFact, node: Node, file: SourceFile): CsharpObjectLiteralTargetShapeResolution;
  retainSourceShape(node: Node, type: Type, shape: CsharpObjectShapeFact, file: SourceFile): CsharpObjectShapeFact | undefined;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
}

export function csharpUntypedObjectLiteralIssue(
  node: Node,
  ast: LiteralContextHost["ast"],
): CsharpNativeConstructionIssue {
  let expression = node;
  while (ast.is.IsParenthesizedExpression(ast.parent(expression))) expression = ast.parent(expression)!;
  const parent = ast.parent(expression);
  const variable = parent !== undefined && ast.is.IsVariableDeclaration(parent)
    ? ast.as.AsVariableDeclaration(parent) : undefined;
  const binding = variable?.Initializer === expression ? ast.name(parent!) : undefined;
  const callable = parent !== undefined && ast.is.IsReturnStatement(parent)
    ? sourceEnclosingCallable(node, ast) : undefined;
  const callableName = callable === undefined ? undefined : ast.name(callable);
  const hint = binding !== undefined && ast.is.IsIdentifier(binding)
    ? `Declare a type for '${ast.text(binding)}' at this initializer.`
    : callableName !== undefined && ast.is.IsIdentifier(callableName)
    ? `Declare a return type for '${ast.text(callableName)}' at its declaration.`
    : "Declare a type at this construction site.";
  return Object.freeze({ node, code: "TSONIC_UNTYPED_OBJECT_LITERAL",
    message: `This object literal has no target type. ${hint}` });
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
    if (context?.kind === "rejected") {
      issue(context.subject, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", context.reason);
      return;
    }
    const contextual = context?.identityUses.length === 0
      ? context.opaqueUses.length === 0 ? source : undefined : context?.component.selectedType;
    const asynchronous = context?.returnedFrom !== undefined && host.ast.hasModifierKind(context.returnedFrom, "async");
    let selected = contextual !== undefined && asynchronous ? queries.types.typeArguments(contextual)[0] : contextual;
    if (selected !== undefined && queries.types.isAny(selected)) {
      issue(node, "TSONIC_ANY_UNSUPPORTED", "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
      return;
    }
    if (selected !== undefined && queries.types.isUnknown(selected) && host.ast.properties(node).some(property =>
      property !== undefined && (host.ast.is.IsSpreadAssignment(property) ||
        host.ast.is.IsGetAccessorDeclaration(property) || host.ast.is.IsSetAccessorDeclaration(property)))) {
      issue(node, "CSHARP_UNSUPPORTED_AST", "Broad native object construction requires named data properties or closed native method values; accessor and spread observations have no admitted closed native contract.");
      return;
    }
    const expectedShapes = (context?.identityUses ?? []).flatMap(use => {
      const selectedType = use.returnedFrom !== undefined && host.ast.hasModifierKind(use.returnedFrom, "async")
        ? queries.types.typeArguments(use.component.selectedType)[0] : use.component.selectedType;
      if (selectedType === undefined || queries.types.isUnknown(selectedType) || queries.types.isAny(selectedType)) return [];
      return [{ use, selectedType, shape: host.resolveShape(selectedType, host.semanticsFor(use.source).sourceFile,
        use.returnedFrom !== undefined ? undefined : use.component.authoredTypeNode) }];
    });
    const requiredShape = expectedShapes.find(expected => expected.shape !== undefined);
    const firstShape = requiredShape?.shape;
    const conflicting = expectedShapes.find(expected => firstShape !== undefined && expected.shape !== undefined &&
      !targetTypeRefEquals(firstShape.targetType, expected.shape.targetType));
    if (conflicting !== undefined) {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
        `${csharpUntypedObjectLiteralIssue(node, host.ast).message} Native construction has conflicting exact identity representations at source offset ${host.ast.pos(conflicting.use.source)}.`);
      return;
    }
    selected = requiredShape?.selectedType ?? selected;
    if (host.ast.properties(node).length === 0 && (selected === undefined || (context?.opaqueUses.length ?? 0) !== 0)) {
      issues.push(csharpUntypedObjectLiteralIssue(node, host.ast));
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
      if ((context?.opaqueUses.length ?? 0) !== 0) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          `${csharpUntypedObjectLiteralIssue(node, host.ast).message} Native construction escapes its closed exact identity-use set at source offset ${host.ast.pos(context!.opaqueUses[0]!)}.`);
        return;
      }
      const shape = requiredShape?.shape ?? host.resolveShape(selected, queries.sourceFile,
        asynchronous ? undefined : context?.component.authoredTypeNode);
      const original = host.resolveShape(source, queries.sourceFile, node);
      const budget = createCsharpMetadataBudget();
      let compatible = false;
      try {
        compatible = shape !== undefined && csharpNativeConstructionMembersMatch(source, original, shape, queries, host, budget.reserve);
      } catch (error) {
        if (!(error instanceof TypeError) || error.message !== "C# immutable metadata exceeds its finite resource budget.") throw error;
        issue(node, "TSONIC_COMPILER_RESOURCE_LIMIT",
          `Native construction of this object literal exceeded the finite metadata limit of ${maximumCsharpMetadataEntries} entries.`);
        return;
      }
      if (shape === undefined || !compatible) {
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
      const expected = requiredShape?.shape ?? host.resolveShape(selected, queries.sourceFile,
        asynchronous ? undefined : context?.component.authoredTypeNode);
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
    if (context !== undefined && context.identityUses.length !== 0) return;
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
