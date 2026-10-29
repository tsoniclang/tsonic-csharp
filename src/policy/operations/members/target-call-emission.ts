import type { CsharpTargetCallEmissionInput } from "../../model/target-call-emission.js";
import type { CsharpTargetCallEmission, CsharpTargetInvocationEmission } from "../../../target-model/records/calls/target-call-emission.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpNativeBinaryOperators, csharpNativePrefixOperators } from "../../../target-model/syntax/native-operators.js";
import { selectCsharpTypeEmission } from "../../types/resolution/type-emission.js";
import { getCsharpTaskResultTargetType, csharpTaskTargetType } from "../../../target-model/types/carriers/delegates.js";
import { csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

export function selectCsharpTargetCallEmission(input: CsharpTargetCallEmissionInput):
  | { readonly kind: "selected"; readonly value: CsharpTargetCallEmission }
  | { readonly kind: "rejected"; readonly reason: string } {
  const { selection, source, argumentPassing: passing } = input;
  const member = selection.targetMember;
  const count = passing.length;
  const refuse = (reason: string) => ({ kind: "rejected" as const, reason });
  if (member.kind !== "method" && member.kind !== "operator" && member.kind !== "constructor")
    return refuse(`Checked call selected C# ${member.kind} '${member.id}', not an invocable method.`);
  const instance = selection.receiver.kind === "instance";
  if (instance && source.sourceReceiver === undefined) return refuse("Selected instance call requires its exact native receiver acquisition.");
  const result = member.kind === "constructor" ? member.declaringType : member.returnType;
  if (result === undefined) return refuse("Selected native call requires its exact physical completion carrier.");
  const selected = member.csharpInvocation;
  let invocation: CsharpTargetInvocationEmission;
  if (selected?.kind === "value-identity") {
    if (!member.static || instance || member.parameters.length !== 1 || count !== 1 || passing[0] ||
      !targetTypeRefEquals(member.parameters[0]!.type, result) || !selectCsharpTypeEmission({ carrier: result }))
      return refuse("A selected value identity requires one by-value operand and its identical native result carrier.");
    invocation = { kind: "value-identity" };
  } else if (selected?.kind === "numeric-conversion") {
    if (member.returnType === undefined || !selectCsharpTypeEmission({ carrier: member.returnType }) || member.parameters.length !== 1 || count !== 1 || passing[0])
      return refuse("The selected numeric conversion requires one exact value and a renderable result type.");
    invocation = { kind: "numeric", target: member.returnType, identity: targetTypeRefEquals(member.parameters[0]!.type, member.returnType) };
  } else if (selected?.kind === "native-task-resolution") {
    const payload = getCsharpTaskResultTargetType(result);
    const parameter = member.parameters[0]?.type;
    if (!member.static || instance || payload === undefined || parameter === undefined || member.parameters.length !== 1 ||
      count !== 1 || passing[0] || !selectCsharpTypeEmission({ carrier: result }) ||
      (selected.form === "task" ? !targetTypeRefEquals(parameter, result)
        : selected.form === "absence" ? !isCsharpVoidTargetType(payload) || !isCsharpAbsenceTargetType(parameter)
        : isCsharpVoidTargetType(payload) || !targetTypeRefEquals(parameter, payload)))
      return refuse("Native Task resolution requires one exact value, Task identity, or absent completion and its matching result carrier.");
    invocation = { kind: "native-task-resolution", form: selected.form,
      owner: csharpTaskTargetType(csharpVoidTargetType()), payload };
  } else if (member.kind === "constructor") {
    if (member.declaringType === undefined || !selectCsharpTypeEmission({ carrier: member.declaringType })) return refuse("Selected constructor call has no exact declaring type.");
    invocation = { kind: "constructor", owner: member.declaringType };
  } else if (selected?.kind === "array-creation") invocation = { kind: "array" };
  else if (selected?.kind === "object-shape-projection") {
    const projection = input.projection;
    if (projection === undefined || projection.selection.kind !== selected.projection || member.returnType === undefined || selected.targetParameterIndex !== 0 || count === 0)
      return refuse("Selected object-shape projection does not contain one exact receiver parameter and result type.");
    invocation = { kind: "projection", projection };
  } else if (selected?.kind === "ecmascript-protocol-dispatch") {
    const index = selected.protocolTargetParameterIndex;
    const owner = member.declaringType;
    const protocol = member.parameters[index]?.type;
    const forwarded = member.parameters.slice(index + 1);
    const supplied = count - index - 1;
    if (!member.static || index !== 1 || count < 2 || owner === undefined || !selectCsharpTypeEmission({ carrier: owner }) || protocol === undefined || member.returnType === undefined ||
      supplied < 0 || supplied > forwarded.length || forwarded.slice(supplied).some(parameter => parameter.optional !== true && parameter.csharpOmittableOptionalArgument !== true))
      return refuse("Selected ECMAScript protocol dispatch does not contain one exact source-order receiver, protocol subject, forwarded argument list, and result carrier.");
    const types = [protocol, ...forwarded.slice(0, supplied).map(parameter => parameter.type), member.returnType];
    if (types.some(carrier => !selectCsharpTypeEmission({ carrier }))) return refuse("Selected ECMAScript protocol dispatch contains an unrenderable protocol, argument, or result carrier.");
    const receiver = member.parameters[0]?.type;
    if (receiver === undefined || input.optional && (!selectCsharpTypeEmission({ carrier: receiver }) || input.liftedResult === undefined || !selectCsharpTypeEmission({ carrier: input.liftedResult })))
      return refuse("Optional ECMAScript protocol dispatch requires exact receiver and lifted result target types.");
    invocation = { kind: "protocol", owner, name: member.targetName, method: selected.protocolMemberName,
      types: Object.freeze(types), forwarded: supplied, receiver, lifted: input.liftedResult };
  } else if (selected?.kind === "native-indexer-get" || selected?.kind === "native-indexer-set") {
    if (member.static || source.sourceReceiver === undefined || input.optional)
      return refuse("A selected native C# indexer call requires one non-optional instance receiver and an explicit indexer invocation relation.");
    const indexes = new Set(selected.indexParameterIndexes);
    const value = selected.kind === "native-indexer-set" ? selected.valueParameterIndex : undefined;
    if (selected.indexParameterIndexes.length === 0 || indexes.size !== selected.indexParameterIndexes.length ||
      selected.indexParameterIndexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= member.parameters.length || index >= count || passing[index]) ||
      value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value >= member.parameters.length || indexes.has(value) || value >= count || passing[value]) ||
      count !== selected.indexParameterIndexes.length + (value === undefined ? 0 : 1))
      return refuse("The selected native C# indexer relation does not cover one exact index argument vector and optional assigned value.");
    invocation = { kind: "indexer", indexes: selected.indexParameterIndexes, value };
  } else if (selected?.kind === "native-event-add" || selected?.kind === "native-event-remove") {
    if (input.optional || count !== 1 || selected.handlerParameterIndex !== 0 || passing[0])
      return refuse("A selected native C# event operation requires one exact non-optional handler argument.");
    const owner = member.static ? member.declaringType : undefined;
    if (member.static ? owner === undefined || !selectCsharpTypeEmission({ carrier: owner }) : !instance)
      return refuse("The selected native C# event operation has no exact renderable instance or declaring-type receiver.");
    invocation = { kind: "event", owner, name: member.targetName, add: selected.kind === "native-event-add" };
  } else if (selected?.kind === "native-operator") {
    const arity = selected.form === "prefix" ? 1 : 2;
    if (selected.operandParameterIndexes.length !== arity || new Set(selected.operandParameterIndexes).size !== arity || count !== member.parameters.length ||
      selected.operandParameterIndexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= count || passing[index]))
      return refuse("The selected native C# operator relation does not cover one exact operand vector.");
    const prefix = csharpNativePrefixOperators;
    const binary = csharpNativeBinaryOperators;
    const operator = selected.form === "prefix" ? prefix[selected.operator as keyof typeof prefix] : binary[selected.operator as keyof typeof binary];
    if (operator === undefined) return refuse(`The selected native C# operator '${selected.operator}' does not match its declared unary/binary form.`);
    invocation = { kind: "operator", form: selected.form, operator, checked: selected.checked === true, operands: selected.operandParameterIndexes };
  } else if (selected?.kind === "static-member") {
    const owner = selected.receiver.kind === "declaring-type" ? member.declaringType : selection.targetInvocationTypeArguments[selected.receiver.index]?.targetType;
    if (owner === undefined || !selectCsharpTypeEmission({ carrier: owner }) || selection.targetInvocationTypeArguments.length !== (selected.receiver.kind === "invocation-type-argument" ? 1 : 0) ||
      selected.receiver.kind === "invocation-type-argument" && selected.receiver.index !== 0)
      return refuse("The selected static operation has no exact renderable receiver type.");
    if (selected.operation !== "call" && (selected.operation === "property-get" ? count !== 0 || selected.valueParameterIndex !== undefined :
      count !== 1 || selected.valueParameterIndex !== 0 || passing[0]))
      return refuse("The selected static operation arguments contradict its exact call/property/event contract.");
    invocation = { kind: "static-member", owner, name: member.targetName, operation: selected.operation };
  } else {
    const owner = instance ? undefined : member.declaringType;
    if (!instance && (owner === undefined || !selectCsharpTypeEmission({ carrier: owner }))) return refuse(`Selected static target call '${member.id}' has no renderable declaring type.`);
    invocation = { kind: "method", owner, name: member.targetName };
  }
  return { kind: "selected", value: Object.freeze({ source, selection, result, instance, invocation: Object.freeze(invocation) }) };
}
