import type { Node, SourceFile } from "@tsonic/tsts";
import { isSourceCallableBodyBoundary } from "@tsonic/target-api/source";
import { csharpCallableValueType } from "../callables/value-type.js";
import { csharpSourceArgumentExpectedType, csharpTargetParameterValueType, getCsharpGeneratorProtocol,
  resolveCsharpObjectShapeMemberBySelectedSubject } from "../../policy/types/index.js";
import { csharpSelectedTargetArgumentBindings, csharpSourceOwnedArgumentBindings } from "../../policy/operations/members/selection/native-use-arguments.js";
import type { CsharpNativeUseSlot } from "../../target-model/records/native-demand.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/member-selections.js";
import type { ResolvedSourceCallInfo } from "../../target-model/records/members.js";
import type { CsharpSourceArgumentGrouping } from "../../target-model/records/operations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpExpectedUseCollection } from "./collection.js";
import type { CsharpExpectedTypeAnalysisInput, CsharpExpectedUseSiteDemand, CsharpExpectedUseWithholding } from "./model.js";

export function createCsharpExpectedConstructUses(input: CsharpExpectedTypeAnalysisInput, collection: CsharpExpectedUseCollection) {
  const { policy, evidence, operations, objectShapes, callables } = input;
  const record = collection.record;
  const at = (owner: Node, slot: CsharpNativeUseSlot): CsharpExpectedUseSiteDemand => ({ owner, slot });
  return Object.freeze({ recordThrownValue, recordInitializer, recordOperationUses });

  function recordThrownValue(node: Node): void {
    const thrown = operations.throwValue.get(node);
    if (thrown !== undefined) record(thrown.expression, thrown.targetCarrier, "required", at(node, { kind: "thrown" }));
  }

  function recordInitializer(node: Node): void {
    const typeNode = policy.ast.typeNode(node);
    const initializer = policy.ast.is.IsVariableDeclaration(node) ? policy.ast.as.AsVariableDeclaration(node)?.Initializer
      : policy.ast.is.IsParameterDeclaration(node) ? policy.ast.as.AsParameterDeclaration(node)?.Initializer
      : policy.ast.is.IsPropertyDeclaration(node) ? policy.ast.as.AsPropertyDeclaration(node)?.Initializer
      : policy.ast.is.IsBindingElement(node) ? policy.ast.as.AsBindingElement(node)?.Initializer
      : policy.ast.is.IsEnumMember(node) ? policy.ast.as.AsEnumMember(node)?.Initializer : undefined;
    const slot: CsharpNativeUseSlot | undefined = policy.ast.is.IsVariableDeclaration(node) || policy.ast.is.IsPropertyDeclaration(node)
      ? { kind: "initializer" } : policy.ast.is.IsParameterDeclaration(node) || policy.ast.is.IsBindingElement(node) ? { kind: "default" } : undefined;
    if (initializer === undefined) return;
    record(initializer, typeNode === undefined ? evidence.storageTargetType.get(node) : evidence.nodeTargetType.get(typeNode),
      typeNode === undefined ? "contextual" : "required", slot === undefined ? undefined : at(node, slot));
  }

  function recordOperationUses(node: Node, sourceFile: SourceFile): boolean {
    const handler = operations.nativeHandler.get(node);
    const pointer = handler?.kind === "native-pointer" ? handler.selection : undefined;
    const location = handler?.kind === "typed-location" ? handler.selection : undefined;
    if (pointer?.kind === "layout-query") return false;
    const intrinsic = (operand: Extract<CsharpNativeUseSlot, { readonly kind: "intrinsic-operand" }>["operand"], index?: number) =>
      at(node, { kind: "intrinsic-operand", operand, ...(index === undefined ? {} : { index }) });
    if (pointer?.kind === "raw-location") record(pointer.expression, pointer.inputType, "required", intrinsic("value"));
    else if (pointer?.kind === "raw-address") for (const [index, argument] of pointer.arguments.entries()) {
      record(argument.expression, argument.sourceType, "required", intrinsic("argument", index));
    } else if (pointer?.kind === "raw-identity") for (const [index, argument] of pointer.arguments.entries()) {
      record(argument, pointer.parameterType, "required", intrinsic("argument", index));
    }
    if (location?.kind === "location-allocate") record(location.initialExpression, location.pointeeType, "required", intrinsic("initial"));
    else if (location?.kind === "location-store") record(location.valueExpression, location.pointeeType, "required", intrinsic("value"));
    else if (location?.kind === "location-equal") {
      record(location.leftExpression, location.parameterType, "required", intrinsic("left"));
      record(location.rightExpression, location.parameterType, "required", intrinsic("right"));
    } else if (location?.kind === "location-hash") record(location.locationExpression, location.parameterType, "required", intrinsic("location"));
    else if (location?.kind === "location-bind" || location?.kind === "location-project" || location?.kind === "location-view") {
      for (const [index, argument] of location.arguments.entries()) record(argument.expression, argument.type, "required", intrinsic("argument", index));
    }
    if (handler === undefined) {
      const call = operations.selectedCall.get(node);
      if (call?.form.kind === "target") {
        if (call.target?.kind === "resolved") recordSelectedCall(node, call.target);
        else if (call.source !== undefined) recordSourceArguments(node, call.source, call.sourceArgumentParameterTypes, call.sourceArgumentGrouping);
      }
      const construction = operations.selectedConstruction.get(node);
      if (construction?.target?.kind === "resolved") recordSelectedCall(node, construction.target);
      else if (construction?.target?.kind === "source-owned") recordSourceArguments(node, construction.target.source,
        construction.sourceArgumentParameterTypes, construction.sourceArgumentGrouping);
    }
    const switchSelection = operations.switchStatement.get(node);
    if (switchSelection?.kind === "ordered") for (const [index, clause] of switchSelection.clauses.entries()) {
      if (clause.comparison?.kind !== "resolved") continue;
      record(clause.comparison.left, clause.comparison.leftInputType, "required", at(node, { kind: "operand", position: "left" }));
      record(clause.comparison.right, clause.comparison.rightInputType, "required", at(node, { kind: "case", index }));
    }
    const binary = operations.binaryOperation.get(node)?.target;
    if (binary?.kind === "resolved") {
      record(binary.left, binary.leftInputType, "required", at(node, { kind: "operand", position: "left" }));
      if (binary.targetOperation.kind === "conditional-value" && binary.targetOperation.branch !== "right") {
        record(binary.left, binary.resultType, "required", at(node, { kind: "present-payload" }));
      }
      const selected = binary.sourceOperator === "="
        ? policy.semantics(sourceFile)?.operations.propertyAccess(binary.left) ?? policy.semantics(sourceFile)?.operations.elementAccess(binary.left) : undefined;
      const shape = selected === undefined ? undefined : objectShapes.resolveNode(selected.receiver.expression, sourceFile);
      const member = shape === undefined || selected === undefined ? undefined
        : resolveCsharpObjectShapeMemberBySelectedSubject(shape, [selected.selectedDeclaration, selected.selectedSymbol]);
      if (binary.targetOperation.kind !== "conditional-value" || binary.targetOperation.branch !== "left") record(binary.right, binary.rightInputType,
        "required", at(node, { kind: "operand", position: "right" }), member?.kind === "resolved" && member.member.exactNumericStorage === true);
    }
    const mutation = operations.jsArrayMutation.get(node);
    if (mutation?.kind === "set-typed-element" && mutation.calculation !== undefined) {
      record(mutation.calculation.left, mutation.calculation.leftInputType, "required", at(node, { kind: "operand", position: "left" }));
      record(mutation.calculation.right, mutation.calculation.rightInputType, "required", at(node, { kind: "operand", position: "right" }));
    }
    const unary = operations.unaryOperation.get(node)?.target;
    if (unary?.kind === "resolved") record(unary.operand, unary.operandType, "required", at(node, { kind: "operand", position: "only" }));
    const element = operations.selectedElement.get(node)?.target;
    if (element?.kind === "resolved") record(policy.ast.as.AsElementAccessExpression(node)?.ArgumentExpression,
      element.targetMember.parameters[element.targetParameterIndex]?.type, "required", at(node, { kind: "key" }));
    else if (element?.kind === "project-indexer") record(policy.ast.as.AsElementAccessExpression(node)?.ArgumentExpression,
      element.keyType, "required", at(node, { kind: "key" }));
    if (pointer?.kind === "store") record(pointer.valueExpression, pointer.pointeeType, "required", intrinsic("value"));
    else if (pointer?.kind === "offset") record(pointer.offsetExpression, pointer.offsetType, "required", intrinsic("offset"));
    const iteration = operations.iteration.get(node);
    if (iteration?.kind === "resolved") record(policy.ast.as.AsForInOrOfStatement(node)?.Expression, iteration.iterableType,
      "required", at(node, { kind: "operand", position: "only" }));
    const yielded = evidence.yield.get(node);
    if (yielded?.operand !== undefined) record(yielded.operand.expression,
      yielded.yieldKind === "delegate" ? evidence.yieldTargetType.get(node)
        : getCsharpGeneratorProtocol(evidence.generatorTargetType.get(yielded.generator.declaration))?.yieldType,
      "required", at(node, { kind: "operand", position: "only" }));
    return true;
  }

  function recordSourceArguments(owner: Node, source: ResolvedSourceCallInfo,
    parameterTypes: readonly (TargetTypeRef | undefined)[] | undefined, grouping: CsharpSourceArgumentGrouping | undefined): void {
    const projected = csharpSourceOwnedArgumentBindings(grouping);
    if (grouping?.kind === "grouped" && projected.kind === "bound") {
      for (const [index, entry] of grouping.arguments.entries()) record(entry.expression, entry.type, "required",
        { owner, slot: projected.bindings[index]!.slot, ...(entry.sourceForm === "spread-sequence" ? { withheld: "argument-sequence" as const } : {}) });
      return;
    }
    const withheld: CsharpExpectedUseWithholding = projected.kind === "refused" ? "argument-refused"
      : projected.kind === "inconsistent" ? "argument-inconsistent" : "argument-unresolved";
    for (const [index, binding] of source.sourceArgumentBindings.entries()) record(source.sourceArguments[binding.sourceArgumentIndex]?.expression,
      parameterTypes?.[index], "required", { owner, slot: { kind: "argument", sourceIndex: binding.sourceArgumentIndex,
        effectiveIndex: binding.effectiveArgumentIndex, sourceParameterIndex: binding.sourceParameterIndex }, withheld });
  }

  function recordSelectedCall(owner: Node, selection: Extract<CsharpTargetCallSelection, { readonly kind: "resolved" }>): void {
    const call = selection.call;
    if (call.receiver.kind === "target-parameter") {
      const parameter = call.targetMember.parameters[call.receiver.targetParameterIndex];
      record(selection.source.sourceReceiver?.expression, parameter === undefined ? undefined : csharpTargetParameterValueType(parameter, "value"),
        "required", at(owner, { kind: "receiver" }));
    }
    const bindings = csharpSelectedTargetArgumentBindings(call);
    const sequences = new Map((call.sequenceArguments ?? []).map(sequence => [sequence.sourceArgumentIndex, sequence]));
    const bySource = new Map<number, Map<number, Extract<typeof bindings, { readonly kind: "bound" }>["bindings"][number]>>();
    if (bindings.kind === "bound") for (const binding of bindings.bindings) {
      const entries = bySource.get(binding.slot.sourceIndex) ?? new Map();
      entries.set(binding.slot.effectiveIndex, binding);
      bySource.set(binding.slot.sourceIndex, entries);
    }
    const mappings = call.origin === "provider" ? new Map(call.argumentMappings.map(mapping => [mapping.effectiveArgumentIndex, mapping])) : undefined;
    const recordedSequences = new Set<number>();
    for (const argument of call.arguments) {
      const sequence = sequences.get(argument.sourceArgumentIndex);
      if (sequence !== undefined && recordedSequences.has(argument.sourceArgumentIndex)) continue;
      if (sequence !== undefined) recordedSequences.add(argument.sourceArgumentIndex);
      const expression = sequence?.expression ?? selection.source.sourceArguments[argument.sourceArgumentIndex]?.expression;
      const mapping = mappings?.get(argument.effectiveArgumentIndex);
      const target = sequence?.sourceType ?? (mapping?.kind === "by-value" && mapping.conversion.kind === "delegate-adapter" &&
        mapping.conversion.strategy === "adaptation" ? mapping.sourceType : sourceArgumentExpectedType(expression, argument.targetParameter, argument.sourceForm));
      const binding = bySource.get(argument.sourceArgumentIndex)?.get(argument.effectiveArgumentIndex);
      record(expression, target, "required", { owner,
        slot: binding?.slot ?? { kind: "argument", sourceIndex: argument.sourceArgumentIndex, effectiveIndex: argument.effectiveArgumentIndex,
          parameterIndex: argument.targetParameterIndex },
        ...(bindings.kind !== "bound" || binding === undefined ? { withheld: "argument-inconsistent" as const }
          : sequence === undefined ? {} : { withheld: "argument-sequence" as const }) });
    }
  }

  function sourceArgumentExpectedType(expression: Node | undefined, parameter: Parameters<typeof csharpSourceArgumentExpectedType>[0],
    sourceForm: Parameters<typeof csharpSourceArgumentExpectedType>[1]): TargetTypeRef {
    const declared = csharpSourceArgumentExpectedType(parameter, sourceForm);
    if (expression === undefined || parameter.csharpSourceArgumentAdapter === undefined || !isSourceCallableBodyBoundary(policy.ast, expression)) return declared;
    const callable = callables.get({ kind: "declaration", declaration: expression });
    return callable === undefined || callable.methodTypeParameterIdentities.length > 0 ? declared : csharpCallableValueType(callable) ?? declared;
  }
}
