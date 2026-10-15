import type { AstReader, Node } from "@tsonic/tsts";
import { sourceDeclarationIsModuleScoped, sourceNodesEqual } from "@tsonic/target-api/source";
import { csharpConstructorBaseCall } from "../../callables/constructor-entry.js";
import type { CsharpNativeUseSlot } from "../../../target-model/records/native-demand.js";
import { getCsharpClassFactory } from "../../../target-model/types/carriers/class-factories.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpNativeDemandAnalysisInput } from "./model.js";

export interface CsharpNativeChildUse {
  readonly expression: Node;
  readonly owner: Node;
  readonly slot: CsharpNativeUseSlot;
}

const expressionKinds = new Set([
  "KindArrayLiteralExpression", "KindArrowFunction", "KindAsExpression", "KindAwaitExpression", "KindBigIntLiteral",
  "KindBinaryExpression", "KindCallExpression", "KindClassExpression", "KindConditionalExpression", "KindDeleteExpression",
  "KindElementAccessExpression", "KindFalseKeyword", "KindFunctionExpression", "KindIdentifier", "KindMetaProperty",
  "KindNewExpression", "KindNoSubstitutionTemplateLiteral", "KindNonNullExpression", "KindNullKeyword",
  "KindNumericLiteral", "KindObjectLiteralExpression", "KindOmittedExpression", "KindParenthesizedExpression",
  "KindPostfixUnaryExpression", "KindPrefixUnaryExpression", "KindPropertyAccessExpression",
  "KindRegularExpressionLiteral", "KindSatisfiesExpression", "KindSpreadElement", "KindStringLiteral",
  "KindSuperKeyword", "KindTaggedTemplateExpression", "KindTemplateExpression", "KindThisKeyword", "KindTrueKeyword",
  "KindTypeAssertionExpression", "KindTypeOfExpression", "KindVoidExpression", "KindYieldExpression",
]);

export function isCsharpNativeExpression(ast: AstReader, node: Node): boolean {
  return expressionKinds.has(ast.kindName(node));
}

function use(owner: Node, expression: Node | undefined, slot: CsharpNativeUseSlot): readonly CsharpNativeChildUse[] {
  return expression === undefined ? [] : [Object.freeze({ owner, expression, slot: Object.freeze(slot) })];
}

function arguments_(ast: AstReader, node: Node): readonly Node[] {
  return ast.arguments(node).filter((argument): argument is Node => argument !== undefined);
}

function argumentUses(owner: Node, nodes: readonly Node[]): readonly CsharpNativeChildUse[] {
  return nodes.flatMap((expression, index) => use(owner, expression, { kind: "argument", sourceIndex: index, effectiveIndex: index }));
}

function intrinsicUses(owner: Node, nodes: readonly (Node | undefined)[], operand: "value" | "argument"): readonly CsharpNativeChildUse[] {
  return nodes.flatMap((expression, index) => use(owner, expression,
    operand === "value" ? { kind: "intrinsic-operand", operand } : { kind: "intrinsic-operand", operand, index }));
}

function projectTypeReceiver(
  input: CsharpNativeDemandAnalysisInput,
  receiver: { readonly expression: Node; readonly valueDeclaration?: Node },
): boolean {
  const declaration = receiver.valueDeclaration ?? input.navigation.sourceReferenceFor(receiver.expression)?.declaration;
  if (declaration === undefined) return false;
  const { ast } = input;
  const reference = input.navigation.referenceFor(receiver.valueDeclaration === undefined ? receiver.expression : ast.name(declaration));
  if (reference === undefined || reference.declaration !== declaration || input.classFactories.classFactory.get(declaration) !== undefined) return false;
  if (!input.navigation.isProjectDeclaration(declaration) || reference.sourceFile.IsDeclarationFile ||
    ast.getFileName(reference.sourceFile).startsWith("tsts-provider://")) return false;
  return ast.is.IsClassDeclaration(declaration) || ast.is.IsClassExpression(declaration) ||
    ast.is.IsInterfaceDeclaration(declaration) || ast.is.IsEnumDeclaration(declaration);
}

function moduleStaticMemberReference(input: CsharpNativeDemandAnalysisInput, node: Node): boolean {
  const { ast, navigation } = input;
  const reference = navigation.referenceFor(node) ?? navigation.referenceFor(ast.name(node));
  if (reference === undefined) return false;
  if (reference.sourceFile !== ast.getSourceFile(node) && (reference.sourceFile.IsDeclarationFile ||
    ast.getFileName(reference.sourceFile).startsWith("tsts-provider://"))) return false;
  const declaration = reference.declaration;
  return (ast.is.IsFunctionDeclaration(declaration) || ast.is.IsExportAssignment(declaration) ||
    ast.is.IsVariableDeclaration(declaration) || ast.is.IsBindingElement(declaration)) && sourceDeclarationIsModuleScoped(declaration, ast);
}

function receiverUses(
  input: CsharpNativeDemandAnalysisInput,
  owner: Node,
  receiver: { readonly expression: Node; readonly valueDeclaration?: Node } | undefined,
): readonly CsharpNativeChildUse[] {
  return receiver === undefined || projectTypeReceiver(input, receiver) ? [] : use(owner, receiver.expression, { kind: "receiver" });
}

export function csharpNativeExpressionChildUses(
  input: CsharpNativeDemandAnalysisInput,
  node: Node,
): readonly CsharpNativeChildUse[] {
  const { ast, operations, evidence, valueReads } = input;
  if (evidence.sourceDefaultValue.get(node) !== undefined) return [];
  const passing = evidence.sourceArgument.get(node);
  if (passing === undefined || passing.kind === "rejected") return [];
  if (!sourceNodesEqual(ast, passing.argument.storageExpression, node)) {
    return use(node, passing.argument.storageExpression, { kind: "operand", position: "only" });
  }
  if (ast.is.IsCallExpression(node)) return callUses(input, node);
  if (ast.is.IsNewExpression(node)) {
    const construction = operations.selectedConstruction.get(node);
    if (construction === undefined) return [];
    if (construction.jsValue.kind === "resolved") {
      return [...use(node, ast.as.AsNewExpression(node)?.Expression, { kind: "callee" }), ...argumentUses(node, arguments_(ast, node))];
    }
    const target = construction.target;
    if (target?.kind === "resolved") return argumentUses(node, target.source.sourceArguments.map(argument => argument.expression));
    if (target?.kind !== "source-owned") return [];
    const sourceArguments = argumentUses(node, target.source.sourceArguments.map(argument => argument.expression));
    const callee = target.source.sourceCallee.expression;
    const calleeType = valueReads.valueRead.get(callee)?.value;
    const reference = input.navigation.sourceReferenceFor(callee);
    const calleeValue = getCsharpClassFactory(calleeType) !== undefined || getCsharpDelegateSignature(calleeType) !== undefined &&
      (reference === undefined || !ast.is.IsClassDeclaration(reference.declaration));
    return calleeValue ? [...sourceArguments, ...use(node, callee, { kind: "callee" })] : sourceArguments;
  }
  if (ast.is.IsPropertyAccessExpression(node)) {
    if (moduleStaticMemberReference(input, node)) return [];
    const selection = operations.selectedProperty.get(node)?.selection;
    if (selection?.kind === "resolved") {
      return selection.receiver.kind === "instance" ? receiverUses(input, node, selection.source.receiver) : [];
    }
    if (selection?.kind === "source-owned") return receiverUses(input, node, selection.source.receiver);
    return selection?.kind === "union-property" ? use(node, ast.as.AsPropertyAccessExpression(node)?.Expression, { kind: "receiver" }) : [];
  }
  if (ast.is.IsElementAccessExpression(node)) {
    const element = ast.as.AsElementAccessExpression(node);
    const classification = operations.selectedElement.get(node);
    const target = classification?.target;
    if (classification !== undefined && classification.jsValue.kind === "not-js-value" && target?.kind === "source-owned" &&
      classification.sourceOwned === undefined && target.source.selectedElementIndex !== undefined) {
      const receiverType = getCsharpNullableElementTargetType(classification.receiverType) ?? classification.receiverType;
      if (receiverType?.kind === "tuple") return receiverUses(input, node, target.source.receiver);
    }
    return [...use(node, element?.Expression, { kind: "receiver" }), ...use(node, element?.ArgumentExpression, { kind: "key" })];
  }
  if (ast.is.IsBinaryExpression(node)) return binaryUses(input, node);
  if (ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) return unaryUses(input, node);
  if (ast.is.IsConditionalExpression(node)) {
    const conditional = ast.as.AsConditionalExpression(node);
    return [
      ...use(node, conditional?.Condition, { kind: "condition" }),
      ...use(node, conditional?.WhenTrue, { kind: "branch", branch: "true" }),
      ...use(node, conditional?.WhenFalse, { kind: "branch", branch: "false" }),
    ];
  }
  if (ast.is.IsDeleteExpression(node)) {
    const deletion = operations.elementDeletion.get(node);
    const operand = ast.as.AsDeleteExpression(node)?.Expression;
    const element = operand !== undefined && ast.is.IsElementAccessExpression(operand) ? ast.as.AsElementAccessExpression(operand) : undefined;
    return deletion === undefined || element === undefined ? []
      : [...use(node, element.Expression, { kind: "receiver" }), ...use(node, element.ArgumentExpression, { kind: "key" })];
  }
  if (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node)) {
    const body = ast.body(node);
    return body !== undefined && isCsharpNativeExpression(ast, body) ? use(node, body, { kind: "return" }) : [];
  }
  if (ast.is.IsArrayLiteralExpression(node)) {
    return ast.children(node).flatMap((element, index) => element === undefined || !isCsharpNativeExpression(ast, element) ? []
      : ast.is.IsSpreadElement(element) ? use(node, ast.as.AsSpreadElement(element)?.Expression, { kind: "element", index })
      : use(node, element, { kind: "element", index }));
  }
  if (ast.is.IsObjectLiteralExpression(node)) {
    return ast.children(node).flatMap((member, index) => {
      if (member === undefined) return [];
      if (ast.is.IsPropertyAssignment(member)) return use(node, ast.as.AsPropertyAssignment(member)?.Initializer, { kind: "member", index });
      if (ast.is.IsShorthandPropertyAssignment(member)) return use(node, ast.name(member), { kind: "member", index });
      if (ast.is.IsSpreadAssignment(member)) return use(node, ast.as.AsSpreadAssignment(member)?.Expression, { kind: "member", index });
      return [];
    });
  }
  if (ast.is.IsTemplateExpression(node)) {
    return (ast.as.AsTemplateExpression(node)?.TemplateSpans?.Nodes ?? []).flatMap((span, index) =>
      span === undefined ? [] : use(node, ast.as.AsTemplateSpan(span)?.Expression, { kind: "span", index }));
  }
  const children: Node[] = [];
  ast.forEachChild(node, child => {
    if (child !== undefined && isCsharpNativeExpression(ast, child)) children.push(child);
  });
  return children.flatMap(child => use(node, child, { kind: "operand", position: "only" }));
}

function callUses(input: CsharpNativeDemandAnalysisInput, node: Node): readonly CsharpNativeChildUse[] {
  const { ast, operations, safetyApplications } = input;
  switch (operations.nativeHandler.get(node)) {
    case "memory-binding": {
      const binding = operations.memoryBinding.get(node);
      return binding?.kind === "field" ? intrinsicUses(node, [binding.expression], "value")
        : binding?.kind === "record" ? intrinsicUses(node, binding.fields.map(field => field.expression), "argument") : [];
    }
    case "explicit-safety": {
      const operation = safetyApplications.safetyOperation.get(node);
      return operation?.kind === "unsafe-context" && operation.fact.kind === "expression"
        ? intrinsicUses(node, [operation.fact.expression], "value") : [];
    }
    case "js-string-conversion": {
      const conversion = operations.jsStringConversion.get(node);
      return conversion?.kind === "resolved" ? intrinsicUses(node, [conversion.sourceValue], "value") : [];
    }
    case "native-pointer":
      return nativePointerUses(input, node);
    case "typed-location":
      return typedLocationUses(input, node);
    case undefined:
      break;
  }
  const classification = operations.selectedCall.get(node);
  if (classification === undefined) return [];
  const form = classification.form;
  const source = classification.source;
  switch (form.kind) {
    case "type-test":
      return use(node, source?.sourceArguments[0]?.expression, { kind: "argument", sourceIndex: 0, effectiveIndex: 0 });
    case "keep-alive":
      return use(node, form.sourceFlow.valueExpression, { kind: "argument", sourceIndex: 0, effectiveIndex: 0 });
    case "js-value": {
      if (form.operation.kind !== "resolved") return [];
      const access = source?.sourceCalleeAccess;
      const member = access?.kind === "property" || access?.kind === "element" ? access : undefined;
      const receiver = member?.receiver.expression ?? source?.sourceCallee.expression ?? ast.as.AsCallExpression(node)?.Expression;
      return [
        ...use(node, receiver, { kind: member === undefined ? "callee" : "receiver" }),
        ...(member?.kind === "element" ? use(node, member.argument.expression, { kind: "key" }) : []),
        ...argumentUses(node, arguments_(ast, node)),
      ];
    }
    case "target":
      break;
  }
  const target = classification.target;
  if (target?.kind === "resolved") {
    const receiver = target.call.receiver.kind === "instance" ? receiverUses(input, node, target.source.sourceReceiver)
      : target.call.receiver.kind === "target-parameter" ? use(node, target.source.sourceReceiver?.expression, { kind: "receiver" }) : [];
    return [...receiver, ...argumentUses(node, target.source.sourceArguments.map(argument => argument.expression))];
  }
  if (target?.kind !== "source-owned" || source === undefined) return [];
  const sourceArguments = argumentUses(node, source.sourceArguments.map(argument => argument.expression));
  if (classification.unionCall.kind === "resolved") {
    return [...use(node, classification.unionCall.receiver, { kind: "receiver" }), ...sourceArguments];
  }
  const callee = classification.sourceCall;
  if (callee === undefined || callee.kind === "rejected" || callee.kind === "union-method") return [];
  if (callee.kind === "function" || callee.kind === "value") return [...use(node, callee.expression, { kind: "callee" }), ...sourceArguments];
  const access = source.sourceCalleeAccess;
  return [
    ...receiverUses(input, node, callee.receiver),
    ...(access?.kind === "element" ? use(node, access.argument.expression, { kind: "key" }) : []),
    ...sourceArguments,
  ];
}

function nativePointerUses(input: CsharpNativeDemandAnalysisInput, node: Node): readonly CsharpNativeChildUse[] {
  const selection = input.operations.nativePointer.get(node);
  switch (selection?.kind) {
    case "raw-location":
      return intrinsicUses(node, [selection.expression], "value");
    case "raw-address":
      return intrinsicUses(node, selection.arguments.map(argument => argument.expression), "argument");
    case "raw-identity":
      return intrinsicUses(node, selection.arguments, "argument");
    case "load":
      return use(node, selection.pointerExpression, { kind: "intrinsic-operand", operand: "location" });
    case "store":
      return [
        ...use(node, selection.pointerExpression, { kind: "intrinsic-operand", operand: "location" }),
        ...use(node, selection.valueExpression, { kind: "intrinsic-operand", operand: "value" }),
      ];
    case "offset":
      return [
        ...use(node, selection.pointerExpression, { kind: "intrinsic-operand", operand: "location" }),
        ...use(node, selection.offsetExpression, { kind: "intrinsic-operand", operand: "offset" }),
      ];
    default:
      return [];
  }
}

function typedLocationUses(input: CsharpNativeDemandAnalysisInput, node: Node): readonly CsharpNativeChildUse[] {
  const operation = input.operations.typedLocation.get(node);
  switch (operation?.kind) {
    case "location-hash":
      return use(node, operation.locationExpression, { kind: "intrinsic-operand", operand: "location" });
    case "location-bind":
    case "location-view":
    case "location-project":
      return intrinsicUses(node, operation.arguments.map(argument => argument.expression), "argument");
    case "location-address": {
      let storage = operation.storage;
      while (storage.kind === "value-property-storage") storage = storage.receiverStorage;
      return use(node, storage.expression, { kind: "intrinsic-operand", operand: "location" });
    }
    case "location-allocate":
      return use(node, operation.initialExpression, { kind: "intrinsic-operand", operand: "initial" });
    case "location-load":
      return use(node, operation.location.expression, { kind: "intrinsic-operand", operand: "location" });
    case "location-store":
      return [
        ...use(node, operation.location.expression, { kind: "intrinsic-operand", operand: "location" }),
        ...use(node, operation.valueExpression, { kind: "intrinsic-operand", operand: "value" }),
      ];
    case "location-equal":
      return [
        ...use(node, operation.leftExpression, { kind: "intrinsic-operand", operand: "left" }),
        ...use(node, operation.rightExpression, { kind: "intrinsic-operand", operand: "right" }),
      ];
    default:
      return [];
  }
}

function binaryUses(input: CsharpNativeDemandAnalysisInput, node: Node): readonly CsharpNativeChildUse[] {
  const { ast, operations } = input;
  const binary = ast.as.AsBinaryExpression(node);
  const left = binary?.Left;
  const right = binary?.Right;
  switch (operations.operatorForm.get(node)) {
    case "destructuring-assignment":
      return use(node, right, { kind: "operand", position: "right" });
    case "js-array-mutation":
      return arrayMutationUses(input, node);
    case "type-test":
      return [...use(node, left, { kind: "operand", position: "left" }),
        ...(getCsharpClassFactory(operations.binaryOperation.get(node)?.instanceFactory) === undefined ? [] : use(node, right, { kind: "operand", position: "right" }))];
    case "typeof-comparison": {
      const comparison = operations.binaryOperation.get(node)?.typeofComparison;
      return use(node, comparison?.operand, { kind: "operand", position: "only" });
    }
    case "js-value-write": {
      const target = left === undefined ? undefined : writeTargetUses(ast, node, left);
      return [...(target ?? []), ...use(node, right, { kind: "operand", position: "right" })];
    }
    case "selected": {
      const selection = operations.binaryOperation.get(node)?.target;
      if (selection?.kind !== "resolved") return [];
      const operation = selection.targetOperation;
      return operation.kind === "conditional-value" && operation.branch === "left"
        ? use(node, selection.left, { kind: "operand", position: "left" })
        : [...use(node, selection.left, { kind: "operand", position: "left" }), ...use(node, selection.right, { kind: "operand", position: "right" })];
    }
    default:
      return [...use(node, left, { kind: "operand", position: "left" }), ...use(node, right, { kind: "operand", position: "right" })];
  }
}

export function csharpNativeOwnCarrier(input: CsharpNativeDemandAnalysisInput, node: Node): TargetTypeRef | undefined {
  const { ast, operations, valueReads } = input;
  if (!ast.is.IsBinaryExpression(node) || operations.operatorForm.get(node) !== "js-value-write") return valueReads.valueRead.get(node)?.value;
  const left = ast.as.AsBinaryExpression(node)?.Left;
  const property = left !== undefined && ast.is.IsPropertyAccessExpression(left) ? operations.selectedProperty.get(left) : undefined;
  const write = property?.selection.kind === "source-owned" && property.sourceOwned?.jsValueProperty.kind === "resolved"
    ? property.sourceOwned.jsValuePropertyWrite
    : left !== undefined && ast.is.IsPropertyAccessExpression(left) ? operations.binaryOperation.get(node)?.propertyWrite
    : left !== undefined && ast.is.IsElementAccessExpression(left) ? operations.binaryOperation.get(node)?.elementWrite : undefined;
  return write?.kind === "resolved" ? write.resultType : undefined;
}

const shortCircuitOperators = new Set([
  "KindAmpersandAmpersandToken", "KindBarBarToken", "KindQuestionQuestionToken",
  "KindAmpersandAmpersandEqualsToken", "KindBarBarEqualsToken", "KindQuestionQuestionEqualsToken",
]);

export function csharpNativeOperandsConditional(ast: AstReader, node: Node): boolean {
  return ast.is.IsConditionalExpression(node) ||
    ast.is.IsBinaryExpression(node) && shortCircuitOperators.has(ast.operatorKindName(node) ?? "");
}

export function csharpNativeOperandsStopAfterNever(input: CsharpNativeDemandAnalysisInput, node: Node): boolean {
  if (!input.ast.is.IsBinaryExpression(node) || input.operations.operatorForm.get(node) !== "selected") return false;
  const selection = input.operations.binaryOperation.get(node)?.target;
  return selection?.kind === "resolved" &&
    (selection.targetOperation.kind === "sequence" || selection.targetOperation.kind === "conditional-value");
}

function writeTargetUses(ast: AstReader, owner: Node, target: Node): readonly CsharpNativeChildUse[] {
  if (ast.is.IsPropertyAccessExpression(target)) return use(owner, ast.as.AsPropertyAccessExpression(target)?.Expression, { kind: "receiver" });
  if (ast.is.IsElementAccessExpression(target)) {
    const element = ast.as.AsElementAccessExpression(target);
    return [...use(owner, element?.Expression, { kind: "receiver" }), ...use(owner, element?.ArgumentExpression, { kind: "key" })];
  }
  return [];
}

function arrayMutationUses(input: CsharpNativeDemandAnalysisInput, node: Node): readonly CsharpNativeChildUse[] {
  const mutation = input.operations.jsArrayMutation.get(node);
  switch (mutation?.kind) {
    case "set-length":
      return [...use(node, mutation.receiver, { kind: "receiver" }), ...use(node, mutation.value, { kind: "operand", position: "right" })];
    case "set-typed-element":
      return [...use(node, mutation.receiver, { kind: "receiver" }), ...use(node, mutation.index, { kind: "key" }),
        ...use(node, mutation.calculation?.right ?? mutation.value, { kind: "operand", position: "right" })];
    case "update-typed-element":
      return [...use(node, mutation.receiver, { kind: "receiver" }), ...use(node, mutation.index, { kind: "key" })];
    default:
      return [];
  }
}

function unaryUses(input: CsharpNativeDemandAnalysisInput, node: Node): readonly CsharpNativeChildUse[] {
  const { ast, operations } = input;
  const operand = ast.is.IsPrefixUnaryExpression(node) ? ast.as.AsPrefixUnaryExpression(node)?.Operand
    : ast.as.AsPostfixUnaryExpression(node)?.Operand;
  switch (operations.operatorForm.get(node)) {
    case "js-value-object-shape-update":
      return [];
    case "js-array-mutation":
      return arrayMutationUses(input, node);
    case "selected": {
      const selection = operations.unaryOperation.get(node)?.target;
      return selection?.kind === "resolved" ? use(node, selection.operand, { kind: "operand", position: "only" }) : [];
    }
    default:
      return use(node, operand, { kind: "operand", position: "only" });
  }
}

export function csharpNativeStatementChildUses(
  input: CsharpNativeDemandAnalysisInput,
  node: Node,
): readonly CsharpNativeChildUse[] {
  const { ast, operations, evidence } = input;
  if (ast.is.IsExpressionStatement(node)) {
    const expression = ast.as.AsExpressionStatement(node)?.Expression;
    const assignment = expression !== undefined && ast.is.IsParenthesizedExpression(expression)
      ? ast.as.AsParenthesizedExpression(expression)?.Expression : expression;
    return assignment !== undefined && operations.operatorForm.get(assignment) === "destructuring-assignment"
      ? use(node, ast.as.AsBinaryExpression(assignment)?.Right, { kind: "operand", position: "right" })
      : use(node, expression, { kind: "effect" });
  }
  if (ast.is.IsReturnStatement(node)) return use(node, ast.as.AsReturnStatement(node)?.Expression, { kind: "return" });
  if (ast.is.IsThrowStatement(node)) {
    return operations.exactCatchRethrow.get(node) ? [] : use(node, ast.as.AsThrowStatement(node)?.Expression, { kind: "thrown" });
  }
  if (ast.is.IsVariableDeclaration(node)) {
    return evidence.sourceStruct.get(node) !== undefined ? [] : use(node, ast.as.AsVariableDeclaration(node)?.Initializer, { kind: "initializer" });
  }
  if (ast.is.IsBindingElement(node)) return use(node, ast.as.AsBindingElement(node)?.Initializer, { kind: "default" });
  if (ast.is.IsIfStatement(node)) return use(node, ast.as.AsIfStatement(node)?.Expression, { kind: "condition" });
  if (ast.is.IsWhileStatement(node)) return use(node, ast.as.AsWhileStatement(node)?.Expression, { kind: "condition" });
  if (ast.is.IsDoStatement(node)) return use(node, ast.as.AsDoStatement(node)?.Expression, { kind: "condition" });
  if (ast.is.IsForStatement(node)) {
    const statement = ast.as.AsForStatement(node);
    const initializer = statement?.Initializer;
    return [
      ...(initializer !== undefined && isCsharpNativeExpression(ast, initializer) ? use(node, initializer, { kind: "initializer" }) : []),
      ...use(node, statement?.Condition, { kind: "condition" }),
      ...use(node, statement?.Incrementor, { kind: "effect" }),
    ];
  }
  if (ast.is.IsForOfStatement(node) || ast.is.IsForInStatement(node)) {
    return use(node, ast.as.AsForInOrOfStatement(node)?.Expression, { kind: "operand", position: "only" });
  }
  if (ast.is.IsSwitchStatement(node)) {
    const statement = ast.as.AsSwitchStatement(node);
    const clauses = statement?.CaseBlock === undefined ? [] : ast.children(statement.CaseBlock);
    return [
      ...use(node, statement?.Expression, { kind: "condition" }),
      ...clauses.flatMap((clause, index) => clause === undefined || !ast.is.IsCaseClause(clause) ? []
        : use(node, ast.as.AsCaseOrDefaultClause(clause)?.Expression, { kind: "case", index })),
    ];
  }
  if (ast.is.IsPropertyDeclaration(node)) return use(node, ast.as.AsPropertyDeclaration(node)?.Initializer, { kind: "initializer" });
  if (ast.is.IsParameterDeclaration(node)) return use(node, ast.as.AsParameterDeclaration(node)?.Initializer, { kind: "default" });
  return [];
}

export function csharpNativeBaseCallUses(input: CsharpNativeDemandAnalysisInput, constructor: Node): {
  readonly statement: Node | undefined;
  readonly arguments: readonly CsharpNativeChildUse[];
} {
  const { ast } = input;
  const baseCall = csharpConstructorBaseCall(ast, constructor);
  if (baseCall === undefined) return { statement: undefined, arguments: [] };
  return {
    statement: ast.parent(baseCall),
    arguments: arguments_(ast, baseCall).flatMap((expression, index) =>
      use(constructor, expression, { kind: "base-argument", sourceIndex: index })),
  };
}
