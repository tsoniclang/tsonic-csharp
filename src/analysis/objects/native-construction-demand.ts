import { providerVirtualDeclarationFactKey, type Node, type SourceFile, type Type } from "@tsonic/tsts";
import { sourceDeclarationIsModuleScoped, sourceEnclosingCallable,
  sourceExpressionCallArgument, sourceCallArgumentCorrespondences,
  type SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpNullableTargetType } from "../../target-model/types/carriers/nullable.js";
import { createCsharpMetadataBudget, maximumCsharpMetadataEntries } from "../../target-model/metadata/immutable.js";
import type { CsharpTypePolicyBaseHost } from "../source-evidence/types/resolution/model.js";
import { csharpNativeConstructionMembersMatch } from "./native-construction-members.js";
import { createCsharpObjectShapeValueStorage } from "../../policy/types/objects/shape-carriers.js";
import type { CsharpNativeConstructionDemandQueries, CsharpNativeConstructionIssue,
  CsharpNativeConstructionSelection } from "../../target-model/records/native/native-construction.js";
import type { CsharpObjectLiteralTargetShapeResolution } from "../../target-model/records/objects/object-shapes.js";
import { createCsharpNativeConstructionRecords } from "../program/records/native/native-construction.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/operations/member-selections.js";
import type { CsharpTypeQueries } from "../../policy/model/type-resolution.js";

type LiteralContextHost = Pick<CsharpTypePolicyBaseHost, "ast" | "navigation" | "semanticsFor">;

interface CsharpLiteralRequirement {
  readonly component: SourceTypeComponentEvidence;
  readonly source: Node;
  readonly returnedFrom?: Node;
  readonly sourceAnnotation?: Node;
}

interface CsharpLiteralContext {
  readonly requirements: readonly CsharpLiteralRequirement[];
  readonly directRequirements: readonly CsharpLiteralRequirement[];
  readonly declarations: readonly Node[];
  readonly unclassified: readonly Node[];
  readonly untypedReturns: readonly Node[];
}

export function selectCsharpLiteralDeclarationContext(
  expression: Node,
  host: LiteralContextHost,
): CsharpLiteralContext {
  const { ast, navigation } = host;
  const flow = navigation.expressionValueFlow(expression);
  const declarations = flow.aliasDeclarations;
  const requirements: CsharpLiteralRequirement[] = [];
  const unclassified = new Set<Node>();
  const untypedReturns = new Set<Node>();
  const addType = (node: Node, typeNode: Node, declaration: Node, returnedFrom?: Node): boolean => {
    const selectedType = host.semanticsFor(typeNode).types.authoredType(typeNode);
    if (selectedType === undefined) {
      unclassified.add(node);
      return false;
    }
    requirements.push({ component: { selectedType, authoredTypeNode: typeNode, declaration },
      source: node, ...(returnedFrom === undefined ? {} : { returnedFrom }),
      ...(node === expression ? { sourceAnnotation: typeNode } : {}) });
    return true;
  };
  const addArgument = (node: Node, returnedFrom?: Node): boolean => {
    const argument = sourceExpressionCallArgument(node, { ast, semantics: { forNode: host.semanticsFor } });
    if (argument === undefined) return false;
    const semantics = host.semanticsFor(argument.call);
    const call = semantics.operations.call(argument.call);
    const rows = call === undefined ? undefined : sourceCallArgumentCorrespondences({ ast, semantics }, call);
    const selected = rows?.filter(row => row.argument.expression === ast.arguments(argument.call)[argument.argumentIndex] &&
      row.binding.sourceForm === "value");
    if (call === undefined || selected?.length !== 1) {
      unclassified.add(node);
      return false;
    }
    const row = selected[0]!;
    const formal = row.binding.selectedParameterType;
    const component = returnedFrom === undefined
      ? { selectedType: formal, declaration: row.parameter.parameterDeclaration,
          authoredTypeNode: row.parameter.authoredTypeNode, contextualCall: call }
      : semantics.types.callable(formal)?.result;
    if (component === undefined) {
      unclassified.add(node);
      return false;
    }
    requirements.push({ component, source: node, ...(returnedFrom === undefined ? {} : { returnedFrom }) });
    return true;
  };
  const addReturn = (node: Node, callable: Node): boolean => {
    const typeNode = ast.typeNode(callable);
    if (typeNode !== undefined) return addType(node, typeNode, callable, callable);
    if (addArgument(callable, callable)) return true;
    untypedReturns.add(node);
    return false;
  };
  const addContext = (node: Node): boolean => {
    let current = node;
    let parent = ast.parent(current);
    const seen = new Set<Node>();
    while (parent !== undefined && (ast.is.IsParenthesizedExpression(parent) ||
        ast.is.IsSatisfiesExpression(parent))) {
      if (seen.has(parent)) return false;
      seen.add(parent);
      current = parent;
      parent = ast.parent(current);
    }
    if (parent === undefined) return false;
    if (ast.is.IsAsExpression(parent) || ast.is.IsTypeAssertion(parent)) {
      const typeNode = ast.typeNode(parent);
      return typeNode !== undefined && addType(node, typeNode, parent);
    }
    if ((ast.is.IsVariableDeclaration(parent) && ast.as.AsVariableDeclaration(parent)?.Initializer === current) ||
        ast.is.IsPropertyDeclaration(parent) && ast.as.AsPropertyDeclaration(parent)?.Initializer === current) {
      const typeNode = ast.typeNode(parent);
      return typeNode !== undefined && addType(node, typeNode, parent);
    }
    if (ast.is.IsReturnStatement(parent) || (ast.is.IsArrowFunction(parent) || ast.is.IsFunctionExpression(parent)) &&
        ast.body(parent) === current) {
      const callable = ast.is.IsReturnStatement(parent) ? sourceEnclosingCallable(parent, ast) : parent;
      return callable !== undefined && addReturn(node, callable);
    }
    if (addArgument(current)) return true;
    if (ast.is.IsBinaryExpression(parent) && ast.operatorKindName(parent) === "KindEqualsToken" &&
        ast.as.AsBinaryExpression(parent)?.Right === current) {
      const left = ast.as.AsBinaryExpression(parent)?.Left;
      const selectedType = left === undefined ? undefined : host.semanticsFor(left).types.expressionType(left);
      if (selectedType === undefined) return false;
      requirements.push({ component: { selectedType }, source: node });
      return true;
    }
    if (ast.is.IsArrayLiteralExpression(parent)) {
      const index = ast.elements(parent).indexOf(current);
      const outer = selectCsharpLiteralDeclarationContext(parent, host);
      for (const requirement of outer.requirements) {
        const semantics = host.semanticsFor(requirement.source);
        const type = requirement.component.selectedType;
        const selectedType = semantics.types.isTuple(type) ? semantics.types.tupleElementTypes(type)[index]
          : semantics.types.isArrayLike(type) ? semantics.types.typeArguments(type)[0] : undefined;
        if (selectedType !== undefined) requirements.push({ component: { selectedType,
          declaration: requirement.component.declaration }, source: node,
          ...(node === expression && requirement.sourceAnnotation !== undefined
            ? { sourceAnnotation: requirement.sourceAnnotation } : {}) });
      }
      return requirements.length > 0;
    }
    if (ast.is.IsPropertyAssignment(parent) && ast.as.AsPropertyAssignment(parent)?.Initializer === current) {
      const literal = ast.parent(parent);
      const name = ast.name(parent);
      if (literal === undefined || name === undefined || !ast.is.IsObjectLiteralExpression(literal) ||
          !ast.is.IsIdentifier(name) && !ast.is.IsStringLiteral(name)) return false;
      const outer = selectCsharpLiteralDeclarationContext(literal, host);
      for (const requirement of outer.requirements) {
        const semantics = host.semanticsFor(requirement.source);
        const properties = semantics.types.propertyInfos(requirement.component.selectedType)
          .filter(property => property.name === ast.text(name));
        if (properties.length === 1) requirements.push({ component: { selectedType: properties[0]!.type,
          declaration: requirement.component.declaration }, source: node,
          ...(node === expression && requirement.sourceAnnotation !== undefined
            ? { sourceAnnotation: requirement.sourceAnnotation } : {}) });
      }
      return requirements.length > 0;
    }
    return false;
  };
  addContext(expression);
  const directRequirements = Object.freeze([...requirements]);
  for (const declaration of declarations) {
    const typeNode = ast.typeNode(declaration);
    if (typeNode !== undefined) addType(declaration, typeNode, declaration);
    else if (declaration !== ast.parent(expression)) {
      const list = ast.parent(declaration);
      if (list === undefined || ast.variableDeclarationKind(list) !== "const") unclassified.add(declaration);
    }
    if (typeNode === undefined && navigation.declarationUseSummary(declaration).bindingWritten) unclassified.add(declaration);
  }
  if (flow.exported || flow.hasUnclassifiedUse) unclassified.add(expression);
  for (const use of flow.uses) {
    if (use.throughMember || use.kind === "type-only" || use.role === "source-linkage" ||
        use.role === "type-only" || use.role === "receiver" || use.role === "condition" ||
        use.role === "call-target") continue;
    if (use.role === "comparison") continue;
    if (use.role === "write" && !use.throughMember) {
      const declaration = navigation.referenceFor(use.reference)?.declaration;
      if (declaration !== undefined && ast.typeNode(declaration) !== undefined) continue;
    }
    if (use.role === "storage") {
      const parent = ast.parent(use.reference);
      if (parent !== undefined && declarations.includes(parent)) continue;
    }
    if (use.role === "argument" && ast.is.IsSpreadElement(ast.parent(use.reference))) continue;
    if (!addContext(use.reference) && use.role !== "return") unclassified.add(use.reference);
  }
  return Object.freeze({ requirements: Object.freeze(requirements), directRequirements, declarations,
    unclassified: Object.freeze([...unclassified]), untypedReturns: Object.freeze([...untypedReturns]) });
}

interface CsharpNativeConstructionHost extends Pick<CsharpTypePolicyBaseHost,
  "ast" | "navigation" | "providers" | "sourceFacts" | "sourceFiles" | "semanticsFor"> {
  resolveShape(type: Type, file: SourceFile, authoredTypeRoot?: Node): CsharpObjectShapeFact | undefined;
  resolveLiteralShape(shapes: readonly CsharpObjectShapeFact[], node: Node, file: SourceFile): CsharpObjectLiteralTargetShapeResolution;
  retainSourceShape(node: Node, type: Type, shape: CsharpObjectShapeFact, file: SourceFile): CsharpObjectShapeFact | undefined;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
  selectTargetCall(node: Node, sourceFile: SourceFile): CsharpTargetCallSelection;
  readonly types: Pick<CsharpTypeQueries, "resolveSourceCallArgumentParameter">;
}

function literalTypeHint(node: Node, host: Pick<CsharpTypePolicyBaseHost, "ast">): string {
  let current = node;
  while (host.ast.is.IsParenthesizedExpression(host.ast.parent(current))) current = host.ast.parent(current)!;
  const declaration = host.ast.parent(current);
  const binding = declaration !== undefined && host.ast.is.IsVariableDeclaration(declaration) ? declaration : undefined;
  const name = host.ast.name(binding);
  if (name !== undefined && host.ast.is.IsIdentifier(name))
    return `Declare a type for '${host.ast.text(name)}' at this initializer.`;
  const callable = sourceEnclosingCallable(node, host.ast);
  const callableName = host.ast.name(callable);
  return callableName === undefined ? "Declare a type at this initializer."
    : `Declare a return type for '${host.ast.text(callableName)}' at its declaration.`;
}

function csharpUntypedObjectLiteralIssue(node: Node, host: Pick<CsharpTypePolicyBaseHost, "ast">): CsharpNativeConstructionIssue {
  return Object.freeze({ node, code: "TSONIC_UNTYPED_OBJECT_LITERAL",
    message: "This object literal has no target type. " + literalTypeHint(node, host) });
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
    if (members.length !== 1 || queries.types.isUnknown(members[0]!) ||
      queries.types.isAny(members[0]!) || queries.types.isNonPrimitive(members[0]!)) return;
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
  const selectedCallUsesValue = (requirement: CsharpLiteralRequirement, declarations: readonly Node[]): boolean => {
    const argument = sourceExpressionCallArgument(requirement.source,
      { ast: host.ast, semantics: { forNode: host.semanticsFor } });
    if (argument === undefined) return false;
    const semantics = host.semanticsFor(argument.call);
    const call = semantics.operations.call(argument.call);
    const rows = call === undefined ? undefined : sourceCallArgumentCorrespondences({ ast: host.ast, semantics }, call);
    const row = rows?.find(candidate => candidate.binding.sourceArgumentIndex === argument.argumentIndex &&
      candidate.binding.sourceForm === "value");
    if (call !== undefined && row !== undefined && requirement.returnedFrom === undefined) {
      const excluded = new Set([argument.argumentIndex, ...call.sourceArguments.flatMap((source, index) => {
        const declaration = host.navigation.referenceFor(source.expression)?.declaration;
        return declaration !== undefined && declarations.includes(declaration) ? [index] : [];
      })]);
      const independent = host.types.resolveSourceCallArgumentParameter(call, row.binding, semantics.sourceFile, excluded);
      if (independent?.kind === "type-parameter") return true;
    }
    const selected = host.selectTargetCall(argument.call, host.semanticsFor(argument.call).sourceFile);
    if (selected.kind !== "resolved") return false;
    if (selected.call.targetMember.csharpInvocation?.kind === "value-identity") return true;
    const arguments_ = selected.call.arguments.filter(entry => entry.sourceArgumentIndex === argument.argumentIndex);
    return arguments_.length > 0 && arguments_.every(entry => {
      const parameter = selected.call.targetMember.parameters[entry.targetParameterIndex];
      return parameter?.csharpAcceptsClosedSourceArgument === true && parameter.csharpValueProjection === "properties";
    });
  };
  const select = (node: Node): void => {
    if (!host.navigation.isProjectDeclaration(node)) return;
    const queries = host.semanticsFor(node);
    const source = queries.types.expressionType(node);
    if (source === undefined || queries.types.constructSignatures(source).length !== 0) return;
    const context = selectCsharpLiteralDeclarationContext(node, host);
    const ownDeclaration = host.ast.parent(node);
    const ownCallable = sourceEnclosingCallable(node, host.ast);
    const ownRequirements = context.directRequirements.filter(requirement =>
      requirement.component.declaration === ownDeclaration ||
      requirement.sourceAnnotation !== undefined ||
      requirement.returnedFrom !== undefined && requirement.returnedFrom === ownCallable);
    const selectedType = (requirement: CsharpLiteralRequirement): Type | undefined =>
      requirement.returnedFrom !== undefined && host.ast.hasModifierKind(requirement.returnedFrom, "async")
        ? queries.types.typeArguments(requirement.component.selectedType)[0] : requirement.component.selectedType;
    if (ownRequirements.some(requirement => {
      const selected = selectedType(requirement);
      return selected !== undefined && queries.types.isAny(selected);
    })) {
      issue(node, "TSONIC_ANY_UNSUPPORTED", "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
      return;
    }
    const requirements = context.requirements.filter(requirement => !selectedCallUsesValue(requirement, context.declarations));
    const broad = requirements.some(requirement => {
      const selected = selectedType(requirement);
      return selected !== undefined && (queries.types.isUnknown(selected) || queries.types.isAny(selected) ||
        queries.types.isNonPrimitive(selected));
    });
    if (broad && host.ast.properties(node).some(property => property !== undefined &&
        (host.ast.is.IsGetAccessorDeclaration(property) || host.ast.is.IsSetAccessorDeclaration(property) ||
          host.ast.is.IsSpreadAssignment(property)))) {
      issue(node, "CSHARP_UNSUPPORTED_AST",
        "Dynamic object construction supports only named data properties with closed native value carriers.");
      return;
    }
    const candidates = requirements.flatMap(requirement => {
      const selected = selectedType(requirement);
      if (selected === undefined || queries.types.isUnknown(selected) || queries.types.isAny(selected) ||
          queries.types.isNonPrimitive(selected)) return [];
      const native = queries.facts.typeSubjects(selected).some(subject => {
        const fact = host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey);
        if (fact === undefined) return false;
        const provider = host.providers.resolveType(fact);
        return provider.kind === "resolved" && provider.relations.some(relation =>
          relation.kind === "type" && relation.objectLiteralConstruction?.kind === "object-initializer");
      });
      const shape = host.resolveShape(selected, queries.sourceFile,
        requirement.returnedFrom !== undefined && host.ast.hasModifierKind(requirement.returnedFrom, "async")
          ? undefined : requirement.component.authoredTypeNode);
      return shape === undefined ? [] : [{ requirement, shape, native }];
    });
    const nominal = candidates.filter(candidate => candidate.native);
    const sourceRequirements = candidates.filter(candidate => !candidate.native);
    const selectedNominal = sourceRequirements.length === 0 ? nominal[0] : undefined;
    if (selectedNominal !== undefined) {
      if (nominal.some(candidate => !targetTypeRefEquals(candidate.shape.targetType, selectedNominal.shape.targetType))) {
        const names = [...new Map(nominal.map(candidate => {
          const node = candidate.requirement.component.authoredTypeNode;
          const range = node === undefined ? undefined : host.ast.authoredRange(node);
          const rendering = candidate.shape.targetType.kind === "target-named"
            ? (candidate.shape.targetType as CsharpTargetNamedTypeRef).csharpRender : undefined;
          const name = node !== undefined && range?.kind === "authored"
            ? host.ast.getSourceText(host.ast.getSourceFile(node)).slice(range.start, range.end)
            : rendering?.kind === "named" ? rendering.name : "the declared native type";
          return [targetTypeRefKey(candidate.shape.targetType), name];
        })).values()];
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          `Native construction has conflicting exact identity requirements '${names.join("' and '")}'. ` + literalTypeHint(node, host));
        return;
      }
      if (context.unclassified.length > 0 && !ownRequirements.some(requirement =>
          requirement.component.authoredTypeNode !== undefined)) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          "Native construction escapes its closed const-alias use set. " + literalTypeHint(node, host));
        return;
      }
      const original = host.resolveShape(source, queries.sourceFile, node);
      const budget = createCsharpMetadataBudget();
      let compatible = false;
      try {
        compatible = csharpNativeConstructionMembersMatch(source, original, selectedNominal.shape, queries, host, budget.reserve);
      } catch (error) {
        if (!(error instanceof TypeError) || error.message !== "C# immutable metadata exceeds its finite resource budget.") throw error;
        issue(node, "TSONIC_COMPILER_RESOURCE_LIMIT",
          `Native construction of this object literal exceeded the finite metadata limit of ${maximumCsharpMetadataEntries} entries.`);
        return;
      }
      if (!compatible) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          "The declared native construction cannot retain all exact fields, absence and native storage without a copied or adapted object.");
        return;
      }
      publish(node, selectedNominal.shape);
      for (const declaration of context.declarations) {
        publish(declaration, selectedNominal.shape);
        for (const reference of host.navigation.referencesToDeclaration(declaration)) publish(reference, selectedNominal.shape);
      }
      return;
    }
    const empty = host.ast.properties(node).length === 0;
    const ownAnnotation = ownRequirements.some(requirement => requirement.sourceAnnotation !== undefined ||
      requirement.component.authoredTypeNode !== undefined);
    const opaque = requirements.some(requirement => {
      const selected = selectedType(requirement);
      if (selected === undefined) return false;
      if (requirement.component.declaration !== undefined && context.declarations.includes(requirement.component.declaration))
        return false;
      if (queries.types.isUnknown(selected) || queries.types.isAny(selected) || queries.types.isNonPrimitive(selected)) return true;
      return sourceExpressionCallArgument(requirement.source,
        { ast: host.ast, semantics: { forNode: host.semanticsFor } }) !== undefined &&
        queries.types.propertyInfos(selected).length === 0;
    });
    if (empty && !ownAnnotation && (opaque || context.untypedReturns.length > 0 || context.unclassified.length > 0)) {
      issues.push(csharpUntypedObjectLiteralIssue(node, host));
      return;
    }
    const structural = sourceRequirements.length > 0 ? sourceRequirements : candidates;
    const own = structural.filter(candidate => ownRequirements.includes(candidate.requirement));
    const expected = [...new Map((own.length > 0 ? own : structural).map(candidate =>
      [targetTypeRefKey(candidate.shape.targetType), candidate.shape])).values()];
    if (expected.length === 0) {
      const checked = host.resolveShape(source, queries.sourceFile, node);
      if (checked !== undefined) expected.push(checked);
    }
    const resolved = expected.length === 0 ? undefined : host.resolveLiteralShape(expected, node, queries.sourceFile);
    if (resolved?.kind === "rejected") {
      issue(resolved.subject, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", resolved.reason);
      return;
    }
    if (resolved?.kind === "resolved") {
      publish(node, resolved.shape);
      if (context.unclassified.length > 0) return;
      for (const declaration of context.declarations) {
        publish(declaration, resolved.shape);
        for (const reference of host.navigation.referencesToDeclaration(declaration)) publish(reference, resolved.shape);
      }
      return;
    }
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
