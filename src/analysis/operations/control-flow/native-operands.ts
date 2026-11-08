import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, targetDiagnosticFromExtension, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { csharpRepresentationDiagnostic } from "../../source-evidence/representations.js";
import type { SourceApplication, SourceProgramFacts, SourceNodeNavigationFacts } from "@tsonic/target-api/source";
import { forwardSourceRefusal } from "../../source-evidence/representations.js";
import { sourceDeclarationIsModuleScoped, sourceNodesEqual, sourceExpressionValueInputs } from "@tsonic/target-api/source";
import type { CsharpNativeCallableCreation, CsharpNativeChildUse, CsharpNativeUseSlot, CsharpNativeDiscardedGuard } from "../../../target-model/records/native/native-demand.js";
import type { CsharpTargetOperationClassifications, CsharpSourceArgumentGrouping } from "../../../target-model/records/operations/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpValueReadClassifications } from "../../../target-model/records/operations/conversions.js";
import type { CsharpClassFactoryIndex } from "../../../target-model/records/objects/class-factories.js";
import type { CsharpSelectedTargetCall } from "../../../target-model/records/objects/members.js";
import type { CsharpBindingPatternClassifications, CsharpDestructuringAssignmentPattern } from "../../../target-model/records/objects/value-projections.js";
import { getCsharpClassFactory } from "../../../target-model/types/carriers/class-factories.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { csharpSelectedTargetArgumentBindings, csharpProviderArgumentSourceCarrier } from "../../../policy/operations/members/native-use-arguments.js";
import { csharpSourceOperationOperator } from "../../../target-model/syntax/operators.js";
import { csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpRuntimeLocationTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpOptionalLocalOperation } from "../../../target-model/records/storage/local-bindings.js";
import { csharpNativeShiftCountType } from "../../../policy/conversions/native-index.js";
import type { CsharpConversionMode } from "../../../target-model/conversions/selection.js";

export interface CsharpNativeOperandInput {
  readonly facts: SourceProgramFacts;
  readonly ast: AstReader;
  readonly navigation: Pick<SourceNodeNavigationFacts, "isProjectDeclaration" | "referenceFor" | "sourceReferenceFor" | "expressionResultUse">;
  readonly evidence: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata" | "sourceArgument" | "sourceDefaultValue" | "sourceField" | "sourceStruct">;
  readonly operations: Pick<CsharpTargetOperationClassifications, "nativeHandler" | "selectedCall" | "selectedConstruction" |
    "selectedProperty" | "selectedElement" | "operatorForm" | "binaryOperation" | "unaryOperation" | "jsArrayMutation" |
    "elementDeletion" | "nativeUnreachable" | "erasedStatement" | "exactCatchRethrow" | "borrowedSequence">;
  readonly valueReads: CsharpValueReadClassifications;
  readonly classFactories: Pick<CsharpClassFactoryIndex, "classFactory" | "factories">;
  readonly bindingPatterns: CsharpBindingPatternClassifications;
  readonly unusedDefault: { readonly get: (initializer: Node) => boolean };
  readonly callableCreation: { readonly get: (expression: Node) => CsharpNativeCallableCreation | undefined };
  readonly optionalLocals: { readonly get: (node: Node) => CsharpOptionalLocalOperation | undefined };
}

export type CsharpNativeOperandRefusal = "argument-refused" | "argument-unresolved" | "argument-inconsistent"
  | "argument-expression-unresolved" | "expression-form-unresolved" | "operation-unresolved" | "construction-unresolved"
  | "callable-creation";

export type CsharpNativeOperandStep =
  | { readonly kind: "use"; readonly use: CsharpNativeChildUse }
  | { readonly kind: "construct"; readonly node: Node };

export interface CsharpNativeOperandSelection {
  readonly runtime: readonly CsharpNativeChildUse[];
  readonly planning: readonly CsharpNativeOperandStep[];
  readonly flow: "sequence" | "conditional" | "short-circuit" | "creation";
  readonly resultUse: "consumed" | "discarded";
  readonly carrier?: TargetTypeRef;
  readonly refusal?: CsharpNativeOperandRefusal;
  readonly refusalMessage?: string;
  readonly refusalCode?: string;
  readonly sourceDiagnostic?: TargetDiagnostic;
  readonly discardedGuard?: CsharpNativeDiscardedGuard;
  readonly conditionalValue?: import("../../../target-model/records/native/native-demand.js").CsharpNativeConditionalValue;
}

interface CsharpNativeArgumentRefusal {
  readonly reason: CsharpNativeOperandRefusal;
  readonly message: string;
  readonly sourceDiagnostic?: TargetDiagnostic;
}

const expressionKinds: ReadonlySet<string> = new Set([
  "KindArrayLiteralExpression", "KindArrowFunction", "KindAsExpression", "KindAwaitExpression", "KindBigIntLiteral", "KindBinaryExpression",
  "KindCallExpression", "KindClassExpression", "KindConditionalExpression", "KindDeleteExpression", "KindElementAccessExpression",
  "KindFalseKeyword", "KindFunctionExpression", "KindIdentifier", "KindMetaProperty", "KindNewExpression", "KindNoSubstitutionTemplateLiteral",
  "KindNonNullExpression", "KindNullKeyword", "KindNumericLiteral", "KindObjectLiteralExpression", "KindOmittedExpression",
  "KindParenthesizedExpression", "KindPostfixUnaryExpression", "KindPrefixUnaryExpression", "KindPropertyAccessExpression",
  "KindRegularExpressionLiteral", "KindSatisfiesExpression", "KindSpreadElement", "KindStringLiteral", "KindSuperKeyword",
  "KindTaggedTemplateExpression", "KindTemplateExpression", "KindThisKeyword", "KindTrueKeyword", "KindTypeAssertionExpression",
  "KindTypeOfExpression", "KindVoidExpression", "KindYieldExpression",
]);

export function isCsharpNativeExpression(ast: AstReader, node: Node): boolean {
  return expressionKinds.has(ast.kindName(node));
}

export function csharpNativeChildUses(owner: Node, expression: Node | undefined, slot: CsharpNativeUseSlot,
  target?: TargetTypeRef, access?: "location", mode?: CsharpConversionMode): readonly CsharpNativeChildUse[] {
  return expression === undefined ? [] : [Object.freeze({ owner, expression, slot: Object.freeze(slot),
    ...(target === undefined ? {} : { context: Object.freeze({ target, ...(mode === undefined ? {} : { mode }) }) }),
    ...(access === undefined ? {} : { access }) })];
}

export function selectCsharpNativeSourceRefusal(
  input: Pick<CsharpNativeOperandInput, "ast" | "operations">,
  node: Node,
): TargetDiagnostic | undefined {
  if (input.operations.nativeHandler.get(node) !== undefined) return undefined;
  const operation = input.operations.binaryOperation.get(node)?.target ?? input.operations.unaryOperation.get(node)?.target;
  if (operation?.kind === "source-refused" || operation?.kind === "native-refused") return csharpRepresentationDiagnostic(operation);
  if (input.ast.is.IsCallExpression(node)) {
    const call = input.operations.selectedCall.get(node);
    return call?.form.kind === "target" && call.target?.kind === "rejected" ? targetDiagnosticFromExtension(node, call.target.diagnostic) : undefined;
  }
  if (input.ast.is.IsNewExpression(node)) {
    const construction = input.operations.selectedConstruction.get(node);
    return construction?.jsValue.kind === "not-js-value" && construction.target?.kind === "rejected"
      ? targetDiagnosticFromExtension(node, construction.target.diagnostic) : undefined;
  }
  if (input.ast.is.IsPropertyAccessExpression(node)) {
    const property = input.operations.selectedProperty.get(node)?.selection;
    return property?.kind === "rejected" ? targetDiagnosticFromExtension(node, property.diagnostic) : undefined;
  }
  if (input.ast.is.IsElementAccessExpression(node)) {
    const element = input.operations.selectedElement.get(node);
    return element?.jsValue.kind === "not-js-value" && element.target?.kind === "rejected"
      ? targetDiagnosticFromExtension(node, element.target.diagnostic) : undefined;
  }
  return undefined;
}

export function selectCsharpNativeOperandUses(input: CsharpNativeOperandInput, node: Node, access?: "location"): CsharpNativeOperandSelection {
  const { ast, operations, evidence } = input;
  const resultUse = input.navigation.expressionResultUse(node);
  const read = input.valueReads.valueRead.get(node);
  const carrier = access === "location" ? read?.flowReadStorage : read?.value;
  const use = (expression: Node | undefined, slot: CsharpNativeUseSlot, target?: TargetTypeRef, access?: "location", mode?: CsharpConversionMode) =>
    csharpNativeChildUses(node, expression, slot, target, access, mode);
  const plan = (uses: readonly CsharpNativeChildUse[]): readonly CsharpNativeOperandStep[] => Object.freeze(uses.map(child =>
    Object.freeze({ kind: "use" as const, use: child })));
  const chosen = (runtime: readonly CsharpNativeChildUse[], flow: CsharpNativeOperandSelection["flow"] = "sequence",
    planning: readonly CsharpNativeOperandStep[] = plan(runtime), own = carrier): CsharpNativeOperandSelection =>
    Object.freeze({ runtime: Object.freeze([...runtime]), planning: Object.freeze([...planning]), flow, resultUse, carrier: own });
  const refused = (refusal: CsharpNativeOperandRefusal, refusalMessage?: string, refusalCode?: string): CsharpNativeOperandSelection =>
    Object.freeze({ ...chosen([]), refusal, ...(refusalMessage === undefined ? {} : { refusalMessage }),
      ...(refusalCode === undefined ? {} : { refusalCode }) });
  const sourceSelection = (flow: CsharpNativeOperandSelection["flow"] = "sequence", own = carrier): CsharpNativeOperandSelection => {
    const inputs = sourceExpressionValueInputs(ast, node);
    return inputs === undefined ? refused("expression-form-unresolved") : chosen(inputs, flow, undefined, own);
  };
  const intrinsic = (expression: Node | undefined, operand: Extract<CsharpNativeUseSlot, { readonly kind: "intrinsic-operand" }>["operand"],
    target?: TargetTypeRef, index?: number) => use(expression, { kind: "intrinsic-operand", operand,
      ...(index === undefined ? {} : { index }) }, target);
  const argumentsFirst = (head: readonly CsharpNativeChildUse[], arguments_: readonly CsharpNativeChildUse[],
    planningHead = head): CsharpNativeOperandSelection => chosen([...head, ...arguments_], "sequence", plan([...arguments_, ...planningHead]));

  if (ast.is.IsPropertyAccessExpression(node)) {
    const reference = input.navigation.referenceFor(node) ?? input.navigation.referenceFor(ast.name(node));
    if (reference !== undefined && sourceDeclarationIsModuleScoped(reference.declaration, ast) &&
      (ast.is.IsFunctionDeclaration(reference.declaration) || ast.is.IsVariableDeclaration(reference.declaration) ||
        ast.is.IsBindingElement(reference.declaration) || ast.is.IsExportAssignment(reference.declaration))) return chosen([]);
  }
  if (access === "location") {
    if (ast.is.IsPropertyAccessExpression(node)) return propertyUses();
    if (ast.is.IsElementAccessExpression(node)) {
      const element = ast.as.AsElementAccessExpression(node);
      return chosen([...use(element?.Expression, { kind: "receiver" }), ...use(element?.ArgumentExpression, { kind: "key" })]);
    }
    if (ast.is.IsParenthesizedExpression(node)) return chosen(use(ast.as.AsParenthesizedExpression(node)?.Expression, { kind: "operand", position: "only" }, undefined, "location"));
    if (ast.is.IsArrayLiteralExpression(node) || ast.is.IsObjectLiteralExpression(node)) {
      const selected = input.bindingPatterns.bindingPatternProjection.get(node)?.assignmentPattern;
      return selected === undefined ? refused("operation-unresolved") : chosen(patternUses(selected));
    }
    return ast.is.IsIdentifier(node) ? chosen([]) : refused("expression-form-unresolved");
  }
  if (evidence.sourceDefaultValue.get(node) !== undefined) return chosen([]);
  const passing = evidence.sourceArgument.get(node);
  if (passing?.kind === "resolved" && !sourceNodesEqual(ast, passing.argument.storageExpression, node)) {
    return chosen(use(passing.argument.storageExpression, { kind: "operand", position: "only" }, undefined, "location"));
  }
  const optionalLocal = input.optionalLocals.get(node);
  if (optionalLocal !== undefined) {
    if (optionalLocal.kind === "read") return chosen([], "sequence", [], optionalLocal.placement.payload);
    if (optionalLocal.kind === "absence-test")
      return chosen(use(optionalLocal.other, { kind: "operand", position: optionalLocal.localFirst ? "right" : "left" }));
    if (optionalLocal.kind === "coalesce") {
      const guarded = use(optionalLocal.right, { kind: "operand", position: "right" })
        .map(child => Object.freeze({ ...child, guard: "if-absent" as const }));
      return chosen(guarded, "sequence", plan(guarded),
        optionalLocal.assignment ? csharpVoidTargetType() : optionalLocal.placement.payload);
    }
    return chosen(optionalLocal.value.kind === "copy" ? []
      : use(optionalLocal.value.expression, { kind: "operand", position: "right" }), "sequence", undefined, csharpVoidTargetType());
  }
  if (ast.is.IsParenthesizedExpression(node)) return sourceSelection();
  const handler = operations.nativeHandler.get(node);
  if (handler !== undefined) {
    const selection = handler.selection;
    if (selection.kind === "rejected") return refused("operation-unresolved");
    switch (handler.kind) {
      case "memory-binding": {
        const memory = handler.selection;
        return memory.kind === "field" ? chosen(intrinsic(memory.expression, "value", memory.type))
          : memory.kind === "record" ? chosen(memory.fields.flatMap((field, index) =>
            intrinsic(field.expression, "argument", csharpRuntimeLocationTargetType(field.member.type), index)))
          : refused("operation-unresolved");
      }
      case "explicit-safety": {
        const safety = handler.selection;
        return safety.kind === "unsafe-context" && safety.fact.kind === "expression" ? chosen(intrinsic(safety.fact.expression, "value")) : chosen([]);
      }
      case "js-string-conversion": {
        const string = handler.selection;
        return string.kind === "resolved" ? chosen(intrinsic(string.sourceValue, "value"), "sequence", undefined, string.resultType)
          : refused("operation-unresolved");
      }
      case "native-pointer": {
        const pointer = handler.selection;
        switch (pointer.kind) {
          case "layout-query": return chosen([]);
          case "raw-location": return chosen(intrinsic(pointer.expression, "value", pointer.inputType));
          case "raw-address": return chosen(pointer.arguments.flatMap((argument, index) => intrinsic(argument.expression, "argument", argument.sourceType, index)));
          case "raw-identity": return chosen(pointer.arguments.flatMap((argument, index) => intrinsic(argument, "argument", pointer.parameterType, index)));
          case "load": return chosen(intrinsic(pointer.pointerExpression, "location", pointer.pointerType));
          case "store": return chosen([...intrinsic(pointer.pointerExpression, "location", pointer.pointerType), ...intrinsic(pointer.valueExpression, "value", pointer.pointeeType)]);
          case "offset": return chosen([...intrinsic(pointer.pointerExpression, "location", pointer.pointerType), ...intrinsic(pointer.offsetExpression, "offset", pointer.offsetType)]);
          case "rejected": return refused("operation-unresolved");
        }
      }
      case "typed-location": {
        const location = handler.selection;
        switch (location.kind) {
          case "location-hash": return chosen(intrinsic(location.locationExpression, "location", location.parameterType));
          case "location-bind": case "location-project": case "location-view":
            return chosen(location.arguments.flatMap((argument, index) => intrinsic(argument.expression, "argument", argument.type, index)));
          case "location-address": {
            let storage = location.storage;
            while (storage.kind === "value-property-storage") storage = storage.receiverStorage;
            return chosen(use(storage.expression, { kind: "intrinsic-operand", operand: "location" }, undefined, "location"));
          }
          case "location-allocate": return chosen(intrinsic(location.initialExpression, "initial", location.pointeeType));
          // A native ref-return operand is the call's own variable reference, read and assigned as its pointee value.
          case "location-load": return chosen(intrinsic(location.location.expression, "location",
            location.location.kind === "native-ref-return" ? location.pointeeType : location.locationType));
          case "location-store": return chosen([...intrinsic(location.location.expression, "location",
            location.location.kind === "native-ref-return" ? location.pointeeType : location.locationType),
          ...intrinsic(location.valueExpression, "value", location.pointeeType)]);
          case "location-equal": return chosen([...intrinsic(location.leftExpression, "left", location.parameterType), ...intrinsic(location.rightExpression, "right", location.parameterType)]);
          case "rejected": return refused("operation-unresolved");
        }
      }
    }
  }
  const sourceDiagnostic = selectCsharpNativeSourceRefusal(input, node);
  if (sourceDiagnostic !== undefined) return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic });
  if (ast.is.IsCallExpression(node)) {
    const call = operations.selectedCall.get(node);
    if (call === undefined) return refused("operation-unresolved");
    if (call.skippedInvocation === true) {
      if (call.source === undefined || call.source.argumentDisposition !== "skip") failTargetAnalysisInvariant("tsonic-csharp",
        "A skipped Native call requires its identical original Source disposition.", node);
      return chosen(use(call.source.callee.occurrence, { kind: "callee" }), "sequence", undefined, call.selectedResultType);
    }
    const guarded = (children: readonly CsharpNativeChildUse[]): readonly CsharpNativeChildUse[] =>
      call.optionalReceiver?.guard === true || call.optionalCallee !== undefined
        ? children.map(child => Object.freeze({ ...child, guard: "if-present" as const })) : children;
    switch (call.form.kind) {
      case "type-test": {
        const operand = call.source?.sourceArguments[0]?.operand;
        return operand?.kind === "refused" ? Object.freeze({ ...refused("argument-refused"), sourceDiagnostic: forwardSourceRefusal(operand) })
          : operand === undefined ? refused("argument-unresolved")
          : chosen(use(operand.value.occurrence, { kind: "argument", sourceIndex: 0, effectiveIndex: 0 }));
      }
      case "keep-alive": return chosen(use(call.form.sourceFlow.valueExpression, { kind: "argument", sourceIndex: 0, effectiveIndex: 0 }));
      case "source-flow-rejected": return refused("operation-unresolved", call.form.sourceFlow.reason, call.form.sourceFlow.code);
      case "js-value": {
        if (call.form.operation.kind !== "resolved") return refused("operation-unresolved");
        const publication = input.facts.applications.application(node);
        if (publication.kind === "refused") return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic: forwardSourceRefusal(publication) });
        const application = publication.value;
        const member = ast.is.IsPropertyAccessExpression(application.callee.occurrence) || ast.is.IsElementAccessExpression(application.callee.occurrence)
          ? input.facts.objects.use(application.callee.occurrence) : undefined;
        if (member?.kind === "refused") return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic: forwardSourceRefusal(member) });
        const useRecord = member?.value;
        const receiver = useRecord?.receiver.occurrence ?? application.callee.occurrence;
        const arguments_ = authoredArguments(application);
        if ("reason" in arguments_) return argumentFailure(arguments_);
        return chosen([
          ...use(receiver, { kind: useRecord === undefined ? "callee" : "receiver" }),
          ...guarded([...(useRecord?.key.kind === "present" ? use(useRecord.key.value.occurrence, { kind: "key" }) : []), ...arguments_])]);
      }
      case "target": break;
    }
    if (call.target?.kind === "resolved") {
      const bound = targetArguments(call.target.source, call.target.call);
      if ("reason" in bound) return argumentFailure(bound);
      const head = call.target.call.receiver.kind === "target-parameter"
        ? use(call.target.source.receiver.kind === "value" ? call.target.source.receiver.occurrence : undefined, { kind: "receiver" })
        : call.target.call.receiver.kind === "instance" ? call.target.source.receiver.kind === "value" ? use(call.target.source.receiver.occurrence, { kind: "receiver" }) : [] : [];
      return call.target.call.receiver.kind === "target-parameter" ? chosen([...head, ...guarded(bound)]) : argumentsFirst(head, guarded(bound));
    }
    if (call.target?.kind === "rejected") return refused("operation-unresolved");
    if (call.target?.kind !== "source-owned" || call.source === undefined) return refused("operation-unresolved");
    if (ast.kindName(call.source.callee.occurrence) === "KindSuperKeyword" || call.unionCall.kind === "resolved") {
      const arguments_ = sourceArguments(call.source, call.sourceArgumentGrouping);
      if ("reason" in arguments_) return argumentFailure(arguments_);
      return call.unionCall.kind === "resolved"
        ? chosen([...use(call.unionCall.receiver, { kind: "receiver" }), ...guarded(arguments_)])
        : argumentsFirst([], arguments_);
    }
    const callee = call.sourceCall;
    if (callee?.kind === "rejected") return refused("operation-unresolved", callee.reason);
    if (callee === undefined || callee.kind === "union-method") return refused("operation-unresolved");
    const arguments_ = sourceArguments(call.source, call.sourceArgumentGrouping);
    if ("reason" in arguments_) return argumentFailure(arguments_);
    // A declared function is called by its declaration reference (a static method group), never evaluated as a value,
    // so it has no runtime callee use; only a callee value is evaluated before the arguments.
    if (callee.kind === "function") return argumentsFirst([], guarded(arguments_));
    if (callee.kind === "value") return argumentsFirst(use(callee.expression, { kind: "callee" }), guarded(arguments_));
    const selectedMember = input.facts.objects.use(call.source.callee.occurrence);
    if (selectedMember.kind === "refused") return Object.freeze({ ...refused("operation-unresolved"),
      sourceDiagnostic: forwardSourceRefusal(selectedMember) });
    const receiver = use(selectedMember.value.receiver.occurrence, { kind: "receiver" });
    const key = guarded(selectedMember.value.key.kind === "present"
      ? use(selectedMember.value.key.value.occurrence, { kind: "key" }) : []);
    return argumentsFirst([...receiver, ...key], guarded(arguments_), [...key, ...receiver]);
  }
  if (ast.is.IsNewExpression(node)) {
    const construction = operations.selectedConstruction.get(node);
    if (construction === undefined || construction.jsValue.kind === "rejected") return refused("construction-unresolved");
    if (construction.jsValue.kind === "resolved") {
      const application = input.facts.applications.application(node);
      if (application.kind === "refused") return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic: forwardSourceRefusal(application) });
      const arguments_ = authoredArguments(application.value);
      return "reason" in arguments_ ? argumentFailure(arguments_)
        : chosen([...use(application.value.callee.occurrence, { kind: "callee" }), ...arguments_]);
    }
    if (construction.target?.kind === "resolved") {
      const arguments_ = targetArguments(construction.target.source, construction.target.call);
      return "reason" in arguments_ ? argumentFailure(arguments_) : argumentsFirst([], arguments_);
    }
    if (construction.target?.kind === "rejected") return refused("construction-unresolved");
    if (construction.target?.kind !== "source-owned") return refused("construction-unresolved");
    const arguments_ = sourceArguments(construction.target.source, construction.sourceArgumentGrouping);
    if ("reason" in arguments_) return argumentFailure(arguments_);
    const callee = construction.target.source.callee.occurrence;
    const type = input.valueReads.valueRead.get(callee)?.value;
    const reference = input.navigation.sourceReferenceFor(callee);
    const value = getCsharpClassFactory(type) !== undefined || type !== undefined && getCsharpDelegateSignature(type) !== undefined &&
      (reference === undefined || !ast.is.IsClassDeclaration(reference.declaration));
    return argumentsFirst(value ? use(callee, { kind: "callee" }) : [], arguments_);
  }
  if (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node)) {
    const creation = input.callableCreation.get(node);
    return creation?.kind !== "selected" ? Object.freeze({ ...chosen([], "creation", [Object.freeze({ kind: "construct", node })], undefined), refusal: "callable-creation" })
      : chosen([], "creation", [Object.freeze({ kind: "construct", node })], creation.carrier);
  }
  if (ast.is.IsClassExpression(node)) return chosen([], "creation", [Object.freeze({ kind: "construct", node })]);
  if (ast.is.IsConditionalExpression(node)) {
    const publication = input.facts.values.operation(node);
    if (publication.kind === "refused") return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic: forwardSourceRefusal(publication) });
    const source = publication.value;
    if (source.kind !== "conditional") return refused("operation-unresolved", "A Native conditional requires its original Source selection record.");
    const control = use(source.control.occurrence, { kind: "condition" });
    let trueNode: Node | undefined;
    let falseNode: Node | undefined;
    if (source.disposition !== "false") {
      if (source.whenTrue.kind === "refused") return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic: forwardSourceRefusal(source.whenTrue) });
      trueNode = source.whenTrue.value.occurrence;
    }
    if (source.disposition !== "true") {
      if (source.whenFalse.kind === "refused") return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic: forwardSourceRefusal(source.whenFalse) });
      falseNode = source.whenFalse.value.occurrence;
    }
    let conditional: NonNullable<CsharpNativeOperandSelection["conditionalValue"]>;
    if (source.disposition === "true") {
      if (trueNode === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted selected branch requires its original Source operand.", node);
      conditional = Object.freeze({ control: source.control.occurrence, disposition: "true", whenTrue: trueNode });
    } else if (source.disposition === "false") {
      if (falseNode === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted selected branch requires its original Source operand.", node);
      conditional = Object.freeze({ control: source.control.occurrence, disposition: "false", whenFalse: falseNode });
    } else {
      if (trueNode === undefined || falseNode === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A dynamic selection requires both admitted Source operands.", node);
      conditional = Object.freeze({ control: source.control.occurrence, disposition: "dynamic", whenTrue: trueNode, whenFalse: falseNode });
    }
    const operands = source.disposition === "true" ? [...control, ...use(trueNode, { kind: "branch", branch: "true" })]
      : source.disposition === "false" ? [...control, ...use(falseNode, { kind: "branch", branch: "false" })]
      : [...control, ...use(trueNode, { kind: "branch", branch: "true" }), ...use(falseNode, { kind: "branch", branch: "false" })];
    return Object.freeze({ ...chosen(operands, source.disposition === "dynamic" ? "conditional" : "sequence", undefined,
      resultUse === "discarded" ? csharpVoidTargetType() : carrier), conditionalValue: conditional });
  }
  if (ast.is.IsBinaryExpression(node)) {
    const publication = input.facts.values.operation(node);
    if (publication.kind === "refused") return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic: forwardSourceRefusal(publication) });
    const source = publication.value;
    const sourceOperator = csharpSourceOperationOperator(source);
    const controlledRight = (source.kind === "and" || source.kind === "or" || source.kind === "coalesce") && source.disposition !== "left"
      ? source.kind === "and" ? source.whenTrue : source.kind === "or" ? source.whenFalse : source.whenAbsent : undefined;
    if (controlledRight?.kind === "refused") {
      return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic: forwardSourceRefusal(controlledRight) });
    }
    const operands = source.kind === "binary" || source.kind === "compound" || source.kind === "sequence" ? source.operands
      : source.kind === "assignment" ? [{ occurrence: source.target }, source.source]
      : source.kind === "in" || source.kind === "instanceof" ? [source.left, source.right]
      : source.kind === "and" || source.kind === "or" || source.kind === "coalesce"
        ? [source.control, ...(controlledRight?.kind === "resolved" ? [controlledRight.value] : [])] : [];
    const left = operands[0]?.occurrence;
    const right = operands.length > 1 ? operands.at(-1)?.occurrence : undefined;
    if ((sourceOperator === "??" || sourceOperator === "&&" || sourceOperator === "||") && resultUse === "discarded") {
      if (source.kind !== "and" && source.kind !== "or" && source.kind !== "coalesce") return refused("operation-unresolved",
        "A discarded selected value requires its original Source control and disposition.");
      const control = use(source.control.occurrence, { kind: "operand", position: "left" });
      if (source.disposition === "left") return chosen(control, "sequence", undefined, csharpVoidTargetType());
      const selectedRight = source.kind === "and" ? source.whenTrue : source.kind === "or" ? source.whenFalse : source.whenAbsent;
      if (selectedRight.kind === "refused") return Object.freeze({ ...refused("operation-unresolved"), sourceDiagnostic: forwardSourceRefusal(selectedRight) });
      const operands = [...control, ...use(selectedRight.value.occurrence, { kind: "operand", position: "right" })];
      if (source.disposition === "right") return chosen(operands, "sequence", undefined, csharpVoidTargetType());
      return Object.freeze({ ...chosen(operands, "short-circuit", undefined, csharpVoidTargetType()),
        discardedGuard: Object.freeze(source.kind === "coalesce" ? { kind: "coalescing" as const }
          : { kind: "boolean" as const, whenTrue: source.kind === "and" ? "right" as const : "left" as const }) });
    }
    switch (operations.operatorForm.get(node)) {
      case "js-value-operation": {
        const selected = operations.binaryOperation.get(node)?.jsValue;
        if (selected?.kind !== "resolved") return refused("operation-unresolved", selected?.kind === "rejected" ? selected.reason : undefined);
        const operands = chosen([...use(left, { kind: "operand", position: "left" }), ...use(right, { kind: "operand", position: "right" })],
          selected.shortCircuit === undefined ? "sequence" : "short-circuit", undefined, selected.resultType);
        return selected.shortCircuit === undefined ? operands : Object.freeze({ ...operands,
          discardedGuard: Object.freeze(sourceOperator === "??"
            ? { kind: "coalescing" as const } : { kind: "js-value" as const, ...selected.shortCircuit }) });
      }
      case "destructuring-assignment": {
        const pattern = input.bindingPatterns.bindingPatternProjection.get(node)?.assignmentPattern;
        return pattern === undefined ? refused("operation-unresolved")
          : chosen([...use(right, { kind: "operand", position: "right" }), ...patternUses(pattern)]);
      }
      case "typeof-comparison": return chosen(use(operations.binaryOperation.get(node)?.typeofComparison?.operand, { kind: "operand", position: "only" }));
      case "js-array-mutation": return mutationUses();
      case "type-test": return chosen([...use(left, { kind: "operand", position: "left" }),
        ...(getCsharpClassFactory(operations.binaryOperation.get(node)?.instanceFactory) === undefined ? [] : use(right, { kind: "operand", position: "right" }))]);
      case "js-value-write": return chosen([...use(left, { kind: "write-target" }, undefined, "location"), ...use(right, { kind: "operand", position: "right" })]);
      case "selected": {
        const selected = operations.binaryOperation.get(node)?.target;
        if (selected?.kind !== "resolved") return refused("operation-unresolved", selected?.kind === "rejected" ? selected.reason : undefined);
        if (selected.targetOperation.kind === "sequence") return chosen(selected.targetOperation.operands.flatMap((operand, index, operands) =>
          use(operand.occurrence, index === operands.length - 1 ? { kind: "operand", position: "right" }
            : { kind: "intrinsic-operand", operand: "argument", index }, index === operands.length - 1 ? selected.resultType : operand.carrier)),
          "sequence", undefined, selected.resultType);
        const assignment = selected.sourceOperator === "=" || selected.sourceOperator.endsWith("=") &&
          !["==", "===", "!=", "!==", "<=", ">="].includes(selected.sourceOperator);
        const operands = [...use(selected.left, assignment ? { kind: "write-target" } : { kind: "operand", position: "left" },
          assignment && selected.compound !== undefined ? selected.compound.storageType : selected.leftInputType, assignment ? "location" : undefined)];
        if (selected.targetOperation.kind !== "conditional-value" || selected.targetOperation.branch !== "left") {
          operands.push(...use(selected.right, { kind: "operand", position: "right" }, csharpNativeShiftCountType(selected)));
        }
        const flow = selected.targetOperation.kind === "conditional-value" && selected.targetOperation.branch === "dynamic" ||
          selected.sourceOperator === "??" || selected.sourceOperator === "??=" ? "short-circuit" : "sequence";
        const result = chosen(operands, operands.length === 1 ? "sequence" : flow, undefined, selected.resultType);
        return result.flow !== "short-circuit" ? result : Object.freeze({ ...result,
          discardedGuard: Object.freeze(selected.sourceOperator === "??" || selected.sourceOperator === "??="
            ? { kind: "coalescing" as const }
            : { kind: "boolean" as const, whenTrue: selected.sourceOperator === "&&" ? "right" as const : "left" as const }) });
      }
      default: return refused("operation-unresolved");
    }
  }
  if (ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
    const form = operations.operatorForm.get(node);
    if (form === "js-array-mutation") return mutationUses();
    const operand = ast.is.IsPrefixUnaryExpression(node) ? ast.as.AsPrefixUnaryExpression(node)?.Operand : ast.as.AsPostfixUnaryExpression(node)?.Operand;
    if (form === "js-value-operation") {
      const selected = operations.unaryOperation.get(node)?.jsValue;
      return selected?.kind !== "resolved" ? refused("operation-unresolved", selected?.kind === "rejected" ? selected.reason : undefined)
        : chosen(use(operand, { kind: "operand", position: "only" }), "sequence", undefined, selected.resultType);
    }
    const selected = operations.unaryOperation.get(node)?.target;
    if (selected?.kind === "literal") return chosen([], "sequence", undefined, selected.resultType);
    if (selected?.kind !== "resolved") return refused("operation-unresolved", selected?.kind === "rejected" ? selected.reason : undefined);
    return chosen(use(selected.operand, selected.sourceOperator === "++" || selected.sourceOperator === "--"
      ? { kind: "update-target" } : { kind: "operand", position: "only" }, selected.operandType,
      selected.sourceOperator === "++" || selected.sourceOperator === "--" ? "location" : undefined,
      selected.operandConversionMode), "sequence", undefined, selected.resultType);
  }
  if (ast.is.IsPropertyAccessExpression(node)) return propertyUses();
  if (ast.is.IsElementAccessExpression(node)) {
    const element = ast.as.AsElementAccessExpression(node);
    const selected = operations.selectedElement.get(node);
    if (selected?.jsValue.kind === "not-js-value" && selected.target?.kind === "rejected") return refused("operation-unresolved");
    const receiverType = selected?.receiverType;
    const unwrapped = receiverType === undefined ? undefined : getCsharpNullableElementTargetType(receiverType) ?? receiverType;
    if (selected?.jsValue.kind === "not-js-value" && selected.target?.kind === "source-owned" && selected.sourceOwned === undefined &&
      selected.target.source.selectedElementIndex !== undefined && unwrapped?.kind === "tuple") return chosen(receiverUses(selected.target.source.receiver));
    return chosen([...use(element?.Expression, { kind: "receiver" }), ...use(element?.ArgumentExpression, { kind: "key" })]);
  }
  if (ast.is.IsArrayLiteralExpression(node)) {
    const inputs = sourceExpressionValueInputs(ast, node);
    if (inputs === undefined) return refused("expression-form-unresolved");
    const elements = ast.children(node);
    const runtime: CsharpNativeChildUse[] = [];
    for (const entry of inputs) {
      if (entry.slot.kind !== "element") continue;
      const element = elements[entry.slot.index];
      if (element === undefined || !isCsharpNativeExpression(ast, element)) continue;
      const borrowed = ast.is.IsSpreadElement(element) ? operations.borrowedSequence.get(entry.expression) : undefined;
      const single = borrowed?.inputs.length === 1 && borrowed.inputs[0]?.kind === "sequence" && !borrowed.inputs[0].optional;
      if (borrowed === undefined || single) { runtime.push(entry); continue; }
      for (const [index, branch] of borrowed.inputs.entries()) {
        if (branch.kind === "empty") break;
        runtime.push(Object.freeze({ owner: borrowed.expression, expression: branch.expression,
          slot: Object.freeze({ kind: "intrinsic-operand" as const, operand: "value" as const, index }),
          ...(index === 0 ? {} : { guard: "if-absent" as const }) }));
        if (!branch.optional) break;
      }
    }
    return chosen(runtime);
  }
  if (ast.is.IsObjectLiteralExpression(node)) {
    const inputs = sourceExpressionValueInputs(ast, node);
    if (inputs === undefined) return refused("expression-form-unresolved");
    const memberUses = new Map<number, CsharpNativeChildUse>();
    for (const entry of inputs) if (entry.slot.kind === "member") memberUses.set(entry.slot.index, entry);
    const runtime: CsharpNativeChildUse[] = [];
    const planning: CsharpNativeOperandStep[] = [];
    for (const [index, member] of ast.children(node).entries()) {
      if (member === undefined) continue;
      const child = memberUses.get(index);
      if (child !== undefined) {
        runtime.push(child); planning.push(Object.freeze({ kind: "use", use: child }));
      } else if (ast.is.IsMethodDeclaration(member) || ast.is.IsGetAccessorDeclaration(member) || ast.is.IsSetAccessorDeclaration(member)) {
        planning.push(Object.freeze({ kind: "construct", node: member }));
      }
    }
    return chosen(runtime, "sequence", planning);
  }
  if (ast.is.IsTemplateExpression(node)) return sourceSelection();
  if (ast.is.IsTaggedTemplateExpression(node)) {
    const tagged = ast.as.AsTaggedTemplateExpression(node);
    const template = tagged?.Template;
    const spans = template === undefined || !ast.is.IsTemplateExpression(template) ? [] : sourceExpressionValueInputs(ast, template);
    if (spans === undefined) return refused("expression-form-unresolved");
    return Object.freeze({ ...chosen([...use(tagged?.Tag, { kind: "callee" }), ...spans.flatMap(entry => use(entry.expression, entry.slot))]),
      refusal: "expression-form-unresolved", refusalMessage: "Expression is outside the current C# planning surface." });
  }
  if (ast.is.IsDeleteExpression(node)) {
    const expression = ast.as.AsDeleteExpression(node)?.Expression;
    return operations.elementDeletion.get(node) === undefined ? refused("operation-unresolved") : chosen(use(expression, { kind: "write-target" }, undefined, "location"));
  }
  if (ast.is.IsAsExpression(node) || ast.is.IsTypeAssertion(node) || ast.is.IsSatisfiesExpression(node) ||
    ast.is.IsNonNullExpression(node) || ast.is.IsAwaitExpression(node) || ast.is.IsYieldExpression(node) || ast.is.IsVoidExpression(node) ||
    ast.is.IsTypeOfExpression(node)) return sourceSelection();
  return isCsharpNativeExpression(ast, node) && ast.children(node).every(child => child === undefined || !isCsharpNativeExpression(ast, child))
    ? chosen([]) : refused("expression-form-unresolved");

  function argumentFailure(failure: CsharpNativeArgumentRefusal): CsharpNativeOperandSelection {
    return Object.freeze({ ...refused(failure.reason, failure.message),
      ...(failure.sourceDiagnostic === undefined ? {} : { sourceDiagnostic: failure.sourceDiagnostic }) });
  }

  function argumentAdmission(application: SourceApplication): CsharpNativeArgumentRefusal | undefined {
    if (application.argumentDisposition === "skip") return application.arguments.length !== 0
      ? Object.freeze({ reason: "argument-inconsistent",
          message: "Skipped Source arguments cannot retain effective parameter bindings." }) : undefined;
    for (const argument of application.sourceArguments) {
      if (argument.operand.kind === "refused") {
        return Object.freeze({ reason: "argument-refused", message: argument.operand.message,
          sourceDiagnostic: forwardSourceRefusal(argument.operand) });
      }
    }
    return undefined;
  }

  function authoredArguments(application: SourceApplication): readonly CsharpNativeChildUse[] | CsharpNativeArgumentRefusal {
    const failure = argumentAdmission(application);
    if (failure !== undefined) return failure;
    if (application.argumentDisposition === "skip") return Object.freeze([]);
    return Object.freeze(application.sourceArguments.flatMap((argument, index) =>
      argument.operand.kind === "resolved" ? intrinsic(argument.operand.value.occurrence, "argument", undefined, index) : []));
  }

  function sourceArguments(application: SourceApplication,
    grouping: CsharpSourceArgumentGrouping | undefined): readonly CsharpNativeChildUse[] | CsharpNativeArgumentRefusal {
    const failure = argumentAdmission(application);
    if (failure !== undefined) return failure;
    if (application.argumentDisposition === "skip") return Object.freeze([]);
    if (grouping?.kind === "source-refused") return Object.freeze({ reason: "argument-refused",
      message: grouping.refusal.message, sourceDiagnostic: forwardSourceRefusal(grouping.refusal) });
    if (grouping?.kind !== "grouped") return Object.freeze({
      reason: grouping?.kind === "refused" ? "argument-refused" : grouping?.kind === "inconsistent" ? "argument-inconsistent" : "argument-unresolved",
      message: grouping?.reason ?? "A source argument requires its complete physical Native binding plan." });
    if (grouping.arguments.length !== application.arguments.length || grouping.arguments.some((entry, index) =>
      entry.binding !== application.arguments[index])) return Object.freeze({ reason: "argument-inconsistent",
      message: "A Native grouping must retain the complete identical Source argument-place vector." });
    const bindingsBySource = new Map<number, typeof grouping.arguments[number][]>();
    for (const entry of grouping.arguments) {
      const entries = bindingsBySource.get(entry.sourceArgumentIndex) ?? [];
      entries.push(entry);
      bindingsBySource.set(entry.sourceArgumentIndex, entries);
    }
    return Object.freeze(application.sourceArguments.flatMap((authored, sourceIndex) => {
      if (authored.operand.kind !== "resolved") return [];
      const operand = authored.operand.value;
      const bindings = bindingsBySource.get(sourceIndex) ?? [];
      if (authored.form === "value" && bindings.length === 1) {
        const entry = bindings[0]!;
        return use(operand.occurrence, { kind: "argument", sourceIndex,
          effectiveIndex: entry.effectiveArgumentIndex, parameterIndex: entry.parameterIndex,
          sourceParameterIndex: entry.sourceParameterIndex }, entry.type);
      }
      return intrinsic(operand.occurrence, "argument", undefined, sourceIndex);
    }));
  }

  function targetArguments(source: SourceApplication, call: CsharpSelectedTargetCall):
    readonly CsharpNativeChildUse[] | CsharpNativeArgumentRefusal {
    const failure = argumentAdmission(source);
    if (failure !== undefined) return failure;
    if (source.argumentDisposition === "skip") return Object.freeze([]);
    const bindingPlan = csharpSelectedTargetArgumentBindings(call);
    if (bindingPlan.kind !== "bound") return Object.freeze({
      reason: bindingPlan.kind === "inconsistent" ? "argument-inconsistent" : bindingPlan.kind === "refused" ? "argument-refused" : "argument-unresolved",
      message: bindingPlan.reason });
    const sequences = new Map(call.sequenceArguments?.map(sequence => [sequence.sourceArgumentIndex, sequence]));
    const mappings = call.origin === "provider" ? new Map(call.argumentMappings.map(mapping => [mapping.effectiveArgumentIndex, mapping])) : undefined;
    const uses: CsharpNativeChildUse[] = [];
    const byEffective = new Map(source.arguments.map(place => [place.effectiveArgumentIndex, place]));
    const bySource = new Map<number, typeof call.arguments[number][]>();
    for (const argument of call.arguments) {
      const original = byEffective.get(argument.effectiveArgumentIndex);
      if (original === undefined || original.sourceArgumentIndex !== argument.sourceArgumentIndex ||
        original.sourceForm !== argument.sourceForm || original.spreadElementIndex !== argument.spreadElementIndex) {
        return Object.freeze({ reason: "argument-inconsistent",
          message: "A Native target binding must retain the exact original Source place and extraction." });
      }
      const entries = bySource.get(argument.sourceArgumentIndex) ?? [];
      entries.push(argument);
      bySource.set(argument.sourceArgumentIndex, entries);
    }
    for (const [sourceIndex, authored] of source.sourceArguments.entries()) {
      if (authored.operand.kind !== "resolved") continue;
      const operand = authored.operand.value;
      const selected = bySource.get(sourceIndex) ?? [];
      if (authored.form === "value" && selected.length === 1) {
        const argument = selected[0]!;
        if (argument.projection !== undefined) {
          const projection = argument.projection;
          if (projection.source !== operand.occurrence || argument.sourceForm !== "value") {
            return Object.freeze({ reason: "argument-inconsistent",
              message: "A Native projection requires its exact authored scalar occurrence." });
          }
          for (const [index, value] of projection.values.entries()) uses.push(...csharpNativeChildUses(projection.source,
            value.expression, { kind: "member", index }, value.member !== undefined ? value.type
              : projection.resultIndex === index ? projection.target : value.type));
          continue;
        }
        const binding = bindingPlan.bindings.find(binding => binding.slot.effectiveIndex === argument.effectiveArgumentIndex);
        if (binding === undefined) return Object.freeze({ reason: "argument-inconsistent",
          message: "A selected Native parameter lost its physical binding slot." });
        uses.push(...use(operand.occurrence, binding.slot,
          csharpProviderArgumentSourceCarrier(mappings?.get(argument.effectiveArgumentIndex)) ?? argument.targetParameter.type));
        continue;
      }
      const sequence = sequences.get(sourceIndex);
      if (sequence !== undefined && (sequence.expression !== operand.occurrence || authored.form !== "spread")) {
        return Object.freeze({ reason: "argument-inconsistent",
          message: "A Native sequence requires the same original authored spread operand." });
      }
      uses.push(...intrinsic(operand.occurrence, "argument", undefined, sourceIndex));
    }
    return Object.freeze(uses);
  }

  function propertyUses(): CsharpNativeOperandSelection {
    const selection = operations.selectedProperty.get(node)?.selection;
    if (selection?.kind === "resolved") return chosen(selection.receiver.kind === "none" ? [] : receiverUses(selection.source.receiver));
    if (selection?.kind === "source-owned") return chosen(receiverUses(selection.source.receiver));
    if (selection?.kind === "rejected") return refused("operation-unresolved");
    return selection?.kind === "union-property" ? chosen(use(ast.as.AsPropertyAccessExpression(node)?.Expression, { kind: "receiver" })) : refused("operation-unresolved");
  }

  function receiverUses(receiver: { readonly expression: Node; readonly valueDeclaration?: Node } | undefined): readonly CsharpNativeChildUse[] {
    if (receiver === undefined) return [];
    const declaration = receiver.valueDeclaration ?? input.navigation.sourceReferenceFor(receiver.expression)?.declaration;
    if (declaration !== undefined && input.navigation.isProjectDeclaration(declaration) && input.classFactories.classFactory.get(declaration) === undefined &&
      (ast.is.IsClassDeclaration(declaration) || ast.is.IsInterfaceDeclaration(declaration) || ast.is.IsEnumDeclaration(declaration))) return [];
    return use(receiver.expression, { kind: "receiver" });
  }

  function mutationUses(): CsharpNativeOperandSelection {
    const mutation = operations.jsArrayMutation.get(node);
    if (mutation?.kind === "set-length") return chosen([...use(mutation.receiver, { kind: "receiver" }), ...use(mutation.value, { kind: "operand", position: "right" })]);
    if (mutation?.kind === "set-typed-element") return chosen([...use(mutation.receiver, { kind: "receiver" }), ...use(mutation.index, { kind: "key" }),
      ...use(mutation.calculation?.right ?? mutation.value, { kind: "operand", position: "right" })]);
    if (mutation?.kind === "update-typed-element") return chosen([...use(mutation.receiver, { kind: "receiver" }), ...use(mutation.index, { kind: "key" })]);
    return refused("operation-unresolved");
  }

  function patternUses(pattern: CsharpDestructuringAssignmentPattern): readonly CsharpNativeChildUse[] {
    return pattern.elements.flatMap(element => {
      if (element === undefined) return [];
      const defaults = element.kind !== "object-rest" && element.initializer !== undefined && !input.unusedDefault.get(element.initializer)
        ? csharpNativeChildUses(element.sourceNode, element.initializer, { kind: "default" }).map(child => Object.freeze({ ...child, guard: "if-absent" as const })) : [];
      const target = element.target;
      return [...defaults, ...(target.kind === "pattern" ? patternUses(target.pattern)
        : csharpNativeChildUses(element.sourceNode, target.node, { kind: "write-target" }, undefined, "location"))];
    });
  }
}
