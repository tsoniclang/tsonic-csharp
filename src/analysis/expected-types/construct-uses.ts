import type { Node, SourceFile } from "@tsonic/tsts";
import { isSourceCallableBodyBoundary } from "@tsonic/target-api/source";
import { csharpCallableValueType } from "../callables/value-type.js";
import {
  csharpSourceArgumentExpectedType,
  csharpTargetParameterValueType,
  getCsharpGeneratorProtocol,
  resolveCsharpObjectShapeMemberBySelectedSubject,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/member-selections.js";
import type { CsharpProviderArgumentMapping, CsharpSelectedTargetCall } from "../../target-model/records/members.js";
import type { CsharpSourceArgumentGrouping } from "../../target-model/records/operations.js";
import {
  csharpSelectedTargetArgumentBindings,
  csharpSourceOwnedArgumentBindings,
  type CsharpNativeArgumentBindings,
  type CsharpNativeUseSlot,
} from "../../target-model/records/native-demand.js";
import type { CsharpExpectedUseCollection } from "./collection.js";
import type { CsharpExpectedTypeAnalysisInput, CsharpExpectedTypeStrength, CsharpExpectedUseDemand } from "./model.js";

const operation: CsharpExpectedUseDemand = Object.freeze({ withheld: "operation" });

export interface CsharpExpectedConstructUses {
  readonly recordThrownValue: (node: Node) => void;
  readonly recordInitializer: (node: Node) => void;
  readonly recordOperationUses: (node: Node, sourceFile: SourceFile) => boolean;
}

export function createCsharpExpectedConstructUses(
  input: CsharpExpectedTypeAnalysisInput,
  collection: CsharpExpectedUseCollection,
): CsharpExpectedConstructUses {
  const { policy, evidence, operations, objectShapes, callables } = input;
  const record = collection.record;
  const at = (owner: Node, slot: CsharpNativeUseSlot) => ({ owner, slot });

  return Object.freeze({ recordThrownValue, recordInitializer, recordOperationUses });

  function recordThrownValue(node: Node): void {
    const thrown = operations.throwValue.get(node);
    if (thrown !== undefined) record(thrown.expression, thrown.targetCarrier, "required", operation);
  }

  function recordInitializer(node: Node): void {
    const typeNode = policy.ast.typeNode(node);
    const initializer = policy.ast.is.IsVariableDeclaration(node)
      ? policy.ast.as.AsVariableDeclaration(node)?.Initializer
      : policy.ast.is.IsParameterDeclaration(node)
        ? policy.ast.as.AsParameterDeclaration(node)?.Initializer
        : policy.ast.is.IsPropertyDeclaration(node)
          ? policy.ast.as.AsPropertyDeclaration(node)?.Initializer
          : policy.ast.is.IsBindingElement(node)
            ? policy.ast.as.AsBindingElement(node)?.Initializer
            : policy.ast.is.IsEnumMember(node)
              ? policy.ast.as.AsEnumMember(node)?.Initializer
              : undefined;
    const slot: CsharpNativeUseSlot | undefined = policy.ast.is.IsVariableDeclaration(node) ||
        policy.ast.is.IsPropertyDeclaration(node) ? { kind: "initializer" }
      : policy.ast.is.IsParameterDeclaration(node) || policy.ast.is.IsBindingElement(node) ? { kind: "default" }
      : undefined;
    record(
      initializer,
      typeNode === undefined
        ? evidence.storageTargetType.get(node)
        : evidence.nodeTargetType.get(typeNode),
      typeNode === undefined ? "contextual" : "required",
      slot === undefined ? undefined : at(node, slot),
    );
  }

  function recordOperationUses(node: Node, sourceFile: SourceFile): boolean {
    const call = operations.selectedCall.get(node);
    const typedLocation = operations.typedLocation.get(node);
    const nativePointer = operations.nativePointer.get(node);
    if (nativePointer?.kind === "layout-query") {
      return false;
    }
    if (nativePointer?.kind === "raw-location") {
      record(nativePointer.expression, nativePointer.inputType, "required", operation);
    } else if (nativePointer?.kind === "raw-address") {
      for (const argument of nativePointer.arguments) record(argument.expression, argument.sourceType, "required", operation);
    } else if (nativePointer?.kind === "raw-identity") {
      for (const argument of nativePointer.arguments) record(argument, nativePointer.parameterType, "required", operation);
    } else if (typedLocation !== undefined && typedLocation.kind !== "not-typed-location" &&
      typedLocation.kind !== "rejected") {
      if (typedLocation.kind === "location-allocate") {
        record(typedLocation.initialExpression, typedLocation.pointeeType, "required", operation);
      } else if (typedLocation.kind === "location-store") {
        record(typedLocation.valueExpression, typedLocation.pointeeType, "required", operation);
      } else if (typedLocation.kind === "location-equal") {
        record(typedLocation.leftExpression, typedLocation.parameterType, "required", operation);
        record(typedLocation.rightExpression, typedLocation.parameterType, "required", operation);
      } else if (typedLocation.kind === "location-hash") {
        record(typedLocation.locationExpression, typedLocation.parameterType, "required", operation);
      } else if (typedLocation.kind === "location-bind" || typedLocation.kind === "location-project" ||
        typedLocation.kind === "location-view") {
        for (const argument of typedLocation.arguments) record(argument.expression, argument.type, "required", operation);
      }
    } else if (call?.target?.kind === "resolved") {
      recordSelectedCallReceiver(node, call.target, "required");
      recordSelectedCallArguments(
        node,
        call.target.source.sourceArguments,
        call.target.call,
        call.target.call.origin === "provider"
          ? call.target.call.argumentMappings
          : undefined,
        "required",
      );
    } else if (call?.source !== undefined) {
      recordSourceArgumentBindings(node, call.source, call.sourceArgumentParameterTypes, call.sourceArgumentGrouping);
    }

    const construction = operations.selectedConstruction.get(node);
    if (construction?.target?.kind === "resolved") {
      recordSelectedCallReceiver(node, construction.target, "required");
      recordSelectedCallArguments(
        node,
        construction.target.source.sourceArguments,
        construction.target.call,
        construction.target.call.origin === "provider"
          ? construction.target.call.argumentMappings
          : undefined,
        "required",
      );
    } else if (construction?.target?.kind === "source-owned") {
      recordSourceArgumentBindings(node, construction.target.source, construction.sourceArgumentParameterTypes,
        construction.sourceArgumentGrouping);
    }

    const switchSelection = operations.switchStatement.get(node);
    if (switchSelection?.kind === "ordered") {
      for (const clause of switchSelection.clauses) {
        if (clause.comparison?.kind !== "resolved") continue;
        record(clause.comparison.left, clause.comparison.leftInputType, "required", operation);
        record(clause.comparison.right, clause.comparison.rightInputType, "required", operation);
      }
    }

    const binary = operations.binaryOperation.get(node)?.target;
    if (binary?.kind === "resolved") {
      record(binary.left, binary.leftInputType, "required", operation);
      if (binary.targetOperation.kind === "conditional-value" && binary.targetOperation.branch !== "right") {
        record(binary.left, binary.resultType, "required", operation);
      }
      const selected = binary.sourceOperator === "="
        ? policy.semantics(sourceFile)?.operations.propertyAccess(binary.left) ??
          policy.semantics(sourceFile)?.operations.elementAccess(binary.left)
        : undefined;
      const shape = selected === undefined ? undefined
        : objectShapes.resolveNode(selected.receiver.expression, sourceFile);
      const member = shape === undefined || selected === undefined ? undefined
        : resolveCsharpObjectShapeMemberBySelectedSubject(shape,
          [selected.selectedDeclaration, selected.selectedSymbol]);
      if (binary.targetOperation.kind !== "conditional-value" || binary.targetOperation.branch !== "left") {
        record(binary.right, binary.rightInputType, "required",
          binary.sourceOperator === "=" ? at(node, { kind: "operand", position: "right" }) : operation,
          member?.kind === "resolved" && member.member.exactNumericStorage === true);
      }
    }
    const mutation = operations.jsArrayMutation.get(node);
    if (mutation?.kind === "set-typed-element" && mutation.calculation !== undefined) {
      record(mutation.calculation.left, mutation.calculation.leftInputType, "required", operation);
      record(mutation.calculation.right, mutation.calculation.rightInputType, "required", operation);
    }
    const unary = operations.unaryOperation.get(node)?.target;
    if (unary?.kind === "resolved") {
      record(unary.operand, unary.operandType, "required", operation);
    }

    const element = operations.selectedElement.get(node)?.target;
    if (element?.kind === "resolved") {
      const argument = policy.ast.as.AsElementAccessExpression(node)?.ArgumentExpression;
      record(
        argument,
        element.targetMember.parameters[element.targetParameterIndex]?.type,
        "required",
        operation,
      );
    } else if (element?.kind === "project-indexer") {
      record(
        policy.ast.as.AsElementAccessExpression(node)?.ArgumentExpression,
        element.keyType,
        "required",
        operation,
      );
    }

    if (nativePointer?.kind === "store") {
      record(nativePointer.valueExpression, nativePointer.pointeeType, "required", operation);
    } else if (nativePointer?.kind === "offset") {
      record(nativePointer.offsetExpression, nativePointer.offsetType, "required", operation);
    }

    const iteration = operations.iteration.get(node);
    if (iteration?.kind === "resolved") {
      record(
        policy.ast.as.AsForInOrOfStatement(node)?.Expression,
        iteration.iterableType,
        "required",
        operation,
      );
    }

    const yieldSelection = evidence.yield.get(node);
    if (yieldSelection?.operand !== undefined) {
      const expectedYieldType = yieldSelection.yieldKind === "delegate"
        ? evidence.yieldTargetType.get(node)
        : getCsharpGeneratorProtocol(
            evidence.generatorTargetType.get(yieldSelection.generator.declaration),
          )?.yieldType;
      record(
        yieldSelection.operand.expression,
        expectedYieldType,
        "required",
        operation,
      );
    }
    return true;
  }

  function recordSourceArgumentBindings(
    owner: Node,
    source: {
      readonly sourceArguments: readonly { readonly expression: Node }[];
      readonly sourceArgumentBindings: readonly { readonly sourceArgumentIndex: number }[];
    },
    parameterTypes: readonly (TargetTypeRef | undefined)[] | undefined,
    grouping: CsharpSourceArgumentGrouping | undefined,
  ): void {
    const bindings = csharpSourceOwnedArgumentBindings(grouping);
    for (let index = 0; index < source.sourceArgumentBindings.length; index += 1) {
      const binding = source.sourceArgumentBindings[index]!;
      const first = source.sourceArgumentBindings.findIndex((candidate) =>
        candidate.sourceArgumentIndex === binding.sourceArgumentIndex) === index;
      record(
        source.sourceArguments[binding.sourceArgumentIndex]?.expression,
        parameterTypes?.[index],
        "required",
        sourceArgumentDemand(owner, bindings, binding.sourceArgumentIndex, first),
      );
    }
  }

  function sourceArgumentDemand(
    owner: Node,
    bindings: CsharpNativeArgumentBindings,
    sourceArgumentIndex: number,
    first: boolean,
  ): CsharpExpectedUseDemand {
    if (bindings.kind !== "bound") return withheldBinding(bindings);
    const binding = bindings.bindings.find((candidate) => candidate.sourceArgumentIndex === sourceArgumentIndex);
    if (binding === undefined) throw new Error(`C# source argument ${sourceArgumentIndex} has no bound native slot.`);
    return binding.sequence || !first ? { withheld: "argument-sequence" } : at(owner, binding.slot);
  }

  function selectedArgumentDemand(
    owner: Node,
    bindings: CsharpNativeArgumentBindings,
    sequences: ReadonlySet<number>,
    argument: CsharpSelectedTargetCall["arguments"][number],
  ): CsharpExpectedUseDemand {
    if (bindings.kind !== "bound") return withheldBinding(bindings);
    if (sequences.has(argument.sourceArgumentIndex)) return { withheld: "argument-sequence" };
    const binding = bindings.bindings.find((candidate) => candidate.slot.sourceIndex === argument.sourceArgumentIndex &&
      candidate.slot.effectiveIndex === argument.effectiveArgumentIndex && candidate.slot.parameterIndex === argument.targetParameterIndex);
    if (binding === undefined) throw new Error(`C# selected argument ${argument.effectiveArgumentIndex} has no bound native slot.`);
    return at(owner, binding.slot);
  }

  function withheldBinding(bindings: Exclude<CsharpNativeArgumentBindings, { readonly kind: "bound" }>): CsharpExpectedUseDemand {
    return { withheld: bindings.kind === "refused" ? "argument-refused"
      : bindings.kind === "unresolved" ? "argument-unresolved" : "argument-inconsistent" };
  }

  function recordSelectedCallArguments(
    owner: Node,
    sourceArguments: readonly { readonly expression: Node }[],
    call: CsharpSelectedTargetCall,
    argumentMappings: readonly CsharpProviderArgumentMapping[] | undefined,
    strength: CsharpExpectedTypeStrength,
  ): void {
    const bindings = csharpSelectedTargetArgumentBindings(call);
    const sequences = new Set((call.sequenceArguments ?? []).map((sequence) => sequence.sourceArgumentIndex));
    for (const argument of call.arguments) {
      const expression = sourceArguments[argument.sourceArgumentIndex]
        ?.expression;
      const mapping = argumentMappings?.find((candidate) =>
        candidate.effectiveArgumentIndex === argument.effectiveArgumentIndex);
      record(
        expression,
        mapping?.kind === "by-value" &&
            mapping.conversion.kind === "delegate-adapter" && mapping.conversion.strategy === "adaptation"
          ? mapping.sourceType
          : sourceArgumentExpectedType(
              expression,
              argument.targetParameter,
              argument.sourceForm,
            ),
        strength,
        selectedArgumentDemand(owner, bindings, sequences, argument),
      );
    }
  }

  function sourceArgumentExpectedType(
    expression: Node | undefined,
    parameter: Parameters<typeof csharpSourceArgumentExpectedType>[0],
    sourceForm: Parameters<typeof csharpSourceArgumentExpectedType>[1],
  ): TargetTypeRef {
    const declaredExpectedType = csharpSourceArgumentExpectedType(
      parameter,
      sourceForm,
    );
    if (
      expression === undefined ||
      parameter.csharpSourceArgumentAdapter === undefined ||
      !isSourceCallableBodyBoundary(policy.ast, expression)
    ) {
      return declaredExpectedType;
    }
    const callable = callables.get({
      kind: "declaration",
      declaration: expression,
    });
    if (callable === undefined || callable.methodTypeParameterIdentities.length > 0) {
      return declaredExpectedType;
    }
    return csharpCallableValueType(callable) ?? declaredExpectedType;
  }

  function recordSelectedCallReceiver(
    owner: Node,
    selection: Extract<CsharpTargetCallSelection, { readonly kind: "resolved" }>,
    strength: CsharpExpectedTypeStrength,
  ): void {
    if (selection.call.receiver.kind !== "target-parameter") {
      return;
    }
    const parameter = selection.call.targetMember.parameters[
      selection.call.receiver.targetParameterIndex
    ];
    record(
      selection.source.sourceReceiver?.expression,
      parameter === undefined
        ? undefined
        : csharpTargetParameterValueType(parameter, "value"),
      strength,
      at(owner, { kind: "receiver" }),
    );
  }
}
