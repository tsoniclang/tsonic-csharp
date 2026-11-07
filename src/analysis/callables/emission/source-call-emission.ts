import type { AstReader, Node } from "@tsonic/tsts";
import { csharpConstructorBaseCall } from "./constructor-entry.js";
import type { TargetSourceProgramFacts } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications, CsharpSourceCallArgumentClassification } from "../../../target-model/records/operations/operations.js";
import type { CsharpConversionClassifications } from "../../../target-model/records/operations/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/program/declarations.js";
import type { SourceCallSelection } from "@tsonic/target-api/source";
import type { CsharpSourceCallEmission, CsharpSourceArgumentsEmission, CsharpSourceArgumentEmissionGroup } from "../../../target-model/records/calls/source-call-emission.js";
import { csharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { csharpConversionIsApplicable } from "../../../policy/conversions/applicability.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/index.js";
import { selectCsharpTypeEmission } from "../../../policy/types/resolution/type-emission.js";
import { createCsharpSourceCallEmissionRecords } from "../../program/records/calls/source-call-emission.js";
import { csharpCallIsPlannedAsSourceCall } from "../../operations/emitted-expressions.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpCaptureStorage } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpSourceReferenceRecords } from "../../../target-model/records/program/source-references.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";

export function analyzeCsharpSourceCallEmission(input: { readonly source: TargetSourceProgramFacts; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly evidence: CsharpSourceEvidenceIndex;
  readonly declarations: CsharpDeclarationClassifications; readonly conversions: CsharpConversionClassifications;
  readonly captures: Pick<CsharpCaptureStorage, "captureClosure">;
  readonly references: Pick<CsharpSourceReferenceRecords, "identifierEmission">;
  readonly admitted: (node: Node) => boolean }) {
  const calls = new Map<Node, CsharpSourceCallEmission>();
  const arguments_ = new Map<Node, CsharpSourceArgumentsEmission>();
  const optional = new Map<Node, { readonly optional: boolean; readonly receiver: Node | undefined }>();
  const arrays = new Map<Node, TargetTypeRef>();
  const issues: TargetDiagnostic[] = [];
  const { syntax: ast } = input.source;
  const refuse = (node: Node, code: `CSHARP_${string}`, message: string): void => { issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  const admitArguments = (node: Node, source: SourceCallSelection, classification: CsharpSourceCallArgumentClassification): void => {
    const grouping = classification.sourceArgumentGrouping;
    if (grouping?.kind !== "grouped") { refuse(node, "CSHARP_SOURCE_CALL_ARGUMENT_GROUPING", "Source-owned arguments have no exact native parameter grouping."); return; }
    const operands: CsharpSourceArgumentsEmission["arguments"][number][] = [];
    for (const entry of grouping.arguments) {
      const value = entry.sourceForm === "spread-sequence" ? ast.as.AsSpreadElement(entry.expression)?.Expression : entry.expression;
      if (value === undefined) { refuse(entry.expression, "CSHARP_SOURCE_CALL_SPREAD_OPERAND", "A selected sequence spread has no exact source operand."); return; }
      operands.push(Object.freeze({ node: value, parameter: entry.parameter, form: entry.sourceForm }));
    }
    const groups: CsharpSourceArgumentEmissionGroup[] = [];
    for (const group of grouping.groups) {
      if (group.collect) { groups.push(Object.freeze({ kind: "collect", arguments: Object.freeze([...group.arguments]) })); continue; }
      const argument = group.arguments[0];
      if (argument !== undefined) { groups.push({ kind: "value", index: argument.index }); continue; }
      const parameter = source.signatureParameters[group.parameterIndex]?.declaration;
      const declaration = parameter === undefined ? undefined : ast.as.AsParameterDeclaration(parameter);
      if (declaration?.Initializer !== undefined && parameter !== undefined && input.declarations.runtimeDefault.get(parameter) === undefined) {
        refuse(node, "CSHARP_OMITTED_PARAMETER_DEFAULT_NOT_EVALUATED", `Omitted source-owned delegate parameter ${group.parameterIndex} has a default initializer that requires exact callee-side default evaluation before C# emission.`); return;
      }
      const conversion = input.conversions.conversion.get(csharpAbsenceTargetType(), group.type, "implicit");
      if (conversion === undefined || !csharpConversionIsApplicable(conversion, "implicit")) {
        refuse(node, "CSHARP_OMITTED_PARAMETER_ABSENCE", `Omitted source-owned selected parameter ${group.parameterIndex} has no exact C# representation for source undefined.`); return;
      }
      groups.push({ kind: "absence", type: group.type, conversion, literal: getCsharpNullableElementTargetType(group.type) !== undefined });
    }
    arguments_.set(node, { arguments: Object.freeze(operands), groups: Object.freeze(groups.map(group => Object.freeze(group))) });
  };
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const construction = input.operations.selectedConstruction.get(node);
    const classification = input.operations.selectedCall.get(node);
    const target = classification?.target ?? construction?.target;
    if (target?.kind === "resolved" || target?.kind === "source-owned") {
      const source = target.source;
      const access = ast.is.IsPropertyAccessExpression(source.callee) || ast.is.IsElementAccessExpression(source.callee) ? source.callee : undefined;
      optional.set(node, { receiver: source.receiver,
        optional: access !== undefined && ast.as.AsPropertyAccessExpression(access)?.QuestionDotToken !== undefined });
      if (target.kind === "resolved" && target.call.targetMember.csharpInvocation?.kind === "array-creation") {
        const member = target.call.targetMember;
        const relation = member.csharpInvocation;
        if (relation?.kind !== "array-creation" || member.returnType?.kind !== "array" || relation.lengthParameterIndex !== 0 ||
          target.call.arguments.length !== 1 || target.call.arguments[0]?.targetParameterIndex !== 0) {
          refuse(node, "CSHARP_ARRAY_CREATION_RELATION", "Selected array-creation relation does not contain one closed element type and one length argument."); continue;
        }
        if (!selectCsharpTypeEmission({ carrier: member.returnType.element })) { refuse(node, "CSHARP_ARRAY_CREATION_ELEMENT_NOT_RENDERABLE", "Selected array-creation element type cannot be rendered in C#."); continue; }
        arrays.set(node, member.returnType.element);
      }
    }
    if (construction?.target?.kind === "source-owned") admitArguments(node, construction.target.source, construction);
    if (classification?.target?.kind !== "source-owned" || !csharpCallIsPlannedAsSourceCall(node, input)) continue;
    const source = classification.target.source;
    // A constructor's leading super(...) is planned as its base initializer from the selected call and its argument
    // parameter types, never through a source callee; it has no callee to acquire.
    if (csharpCallIsConstructorBaseCall(ast, node)) continue;
    if (classification.unionCall.kind === "rejected") { refuse(node, "CSHARP_UNION_CALL_DISPATCH", classification.unionCall.reason); continue; }
    const selected = classification.unionCall.kind === "resolved" ? undefined : classification.sourceCall;
    if (selected?.kind === "rejected") {
      if (selected.refusal !== undefined) issues.push({ code: selected.refusal.code, category: "error", source: "tsonic-csharp",
        sourceNode: selected.refusal.site, message: selected.refusal.message });
      else refuse(node, "CSHARP_SOURCE_CALLEE_NOT_REPRESENTABLE", selected.reason);
      continue;
    }
    admitArguments(node, source, classification);
    const typeArguments = classification.sourceTypeArguments;
    if (typeArguments === undefined || typeArguments.some(carrier => !selectCsharpTypeEmission({ carrier }))) {
      refuse(node, "CSHARP_SOURCE_CALL_TYPE_ARGUMENT_NOT_RENDERABLE", "Source-owned generic call has a selected method type argument with no closed C# representation."); continue;
    }
    if (classification.unionCall.kind === "resolved") {
      const union = classification.unionCall;
      const grouping = classification.sourceArgumentGrouping;
      if (grouping?.kind !== "grouped" || union.methods.length === 0 || !selectCsharpTypeEmission({ carrier: union.receiverType }) || !selectCsharpTypeEmission({ carrier: union.resultType }) ||
        grouping.groups.some(group => !selectCsharpTypeEmission({ carrier: group.type }))) {
        refuse(node, "CSHARP_UNION_DISPATCHER_CONTRACT", "A closed union dispatcher requires exact native receiver, argument, result and containing-type contracts."); continue;
      }
      calls.set(node, { kind: "union", union, typeArguments, parameters: Object.freeze(grouping.groups.map(group => group.type)), void: isCsharpVoidTargetType(union.resultType) });
      continue;
    }
    if (selected === undefined || selected.kind === "union-method") {
      refuse(node, "CSHARP_SOURCE_CALLEE_NOT_REPRESENTABLE", "Source call has no exact sealed callee acquisition contract."); continue;
    }
    if ((source.declaration === undefined || !input.source.facts.navigation.identity.isProjectDeclaration(source.declaration)) &&
      !input.source.facts.navigation.identity.isProjectDeclaration(source.signature)) {
      refuse(node, "CSHARP_EXTERNAL_SOURCE_CALLEE", "The exact selected source callee is external to the project and has no C# target relation."); continue;
    }
    const result = classification.sourceResult;
    if (result === undefined) { refuse(node, "CSHARP_SOURCE_CALL_RESULT_NOT_REPRESENTED", "An admitted source call requires its exact native completion and selected result."); continue; }
    let methodValue = classification.sourceMethodValue;
    if (selected.kind === "value") {
      const reference = input.references.identifierEmission.get(selected.expression);
      if (reference?.kind === "frame") {
        const closure = input.captures.captureClosure.get(reference.declaration);
        if (closure === undefined || closure.method.declaration !== reference.declaration || !closure.frame.methods.includes(closure.method)) {
          refuse(node, "CSHARP_CAPTURED_CALLEE_CLOSURE", "A captured source callee requires its completed native closure acquisition contract."); continue;
        }
        if (closure.frame.ownership === "activation") {
          const constructor = ast.parent(closure.frame.scope);
          const owner = constructor === undefined ? undefined : ast.parent(constructor);
          const classProtocol = owner !== undefined && input.source.facts.navigation.identity.isProjectDeclaration(owner) &&
            closure.frame.protocols.some(protocol => protocol.kind === "class" && protocol.declaration === owner);
          const addressProtocol = closure.frame.protocols.some(protocol => protocol.kind === "address" &&
            closure.frame.bindings.some(binding => binding.declaration === protocol.declaration));
          if ((!classProtocol && !addressProtocol) || getCsharpDelegateSignature(closure.method.type) === undefined) {
            refuse(node, "CSHARP_CAPTURED_METHOD_ACTIVATION", "A captured native method requires its exact class or address activation protocol and signature."); continue;
          }
          methodValue = undefined;
        } else {
          methodValue = getCsharpMethodValue(closure.method.type);
          if (closure.frame.ownership !== "value" ||
              !closure.frame.protocols.some(protocol => protocol.kind === "quantified" && protocol.declaration === reference.declaration) ||
              methodValue === undefined) {
            refuse(node, "CSHARP_CAPTURED_INVOCATION_METHOD_VALUE", "A captured invocation handle requires its completed native method-value contract."); continue;
          }
        }
      }
    }
    if (selected.kind === "value" && typeArguments.length !== 0 && methodValue === undefined) {
      refuse(node, "CSHARP_GENERIC_CALLEE_SHAPE", "Selected generic source call requires a C# callee shape that can carry type arguments."); continue;
    }
    calls.set(node, { kind: "source", callee: selected, result, typeArguments,
      methodValue: methodValue?.method, optionalCallee: classification.optionalCallee });
  }
  return Object.freeze({ records: createCsharpSourceCallEmissionRecords({ calls, arguments: arguments_, optional, arrays }), issues: Object.freeze(issues) });
}

function csharpCallIsConstructorBaseCall(ast: AstReader, call: Node): boolean {
  const statement = ast.parent(call);
  const block = statement === undefined ? undefined : ast.parent(statement);
  const constructor = block === undefined ? undefined : ast.parent(block);
  return constructor !== undefined && ast.is.IsConstructorDeclaration(constructor) && csharpConstructorBaseCall(ast, constructor)?.call === call;
}
