import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { HasSyntacticModifier, ModifierFlagsAsync, forEachSourceImmediateEvaluationChild } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpLambdaBodyEmission } from "../../target-model/records/lambda-emission.js";
import type { CsharpCallableDeclarationRecords } from "../../target-model/records/callable-emission.js";
import type { CsharpCallableParameterRecords } from "../../target-model/records/parameter-emission.js";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpCallableCreationIndex } from "../../target-model/records/callable-values.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpTypeEmissionRecords } from "../../target-model/records/type-emission.js";
import type { CsharpTargetArgumentRecords } from "../../target-model/records/target-arguments.js";
import type { CsharpNativeConstantRecords } from "../../target-model/records/native-constants.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import { csharpVoidReturnCompletion } from "../../policy/conversions/callable-completions.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { createCsharpLambdaEmissionRecords } from "../program/records/lambda-emission.js";

export function analyzeCsharpLambdaEmission(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly declarations: CsharpCallableDeclarationRecords;
  readonly parameters: CsharpCallableParameterRecords;
  readonly captures: CsharpCaptureStorage; readonly creations: CsharpCallableCreationIndex; readonly storage: CsharpStorageClassifications;
  readonly values: CsharpValueReadClassifications; readonly types: CsharpTypeEmissionRecords;
  readonly arguments: CsharpTargetArgumentRecords; readonly constants: CsharpNativeConstantRecords; readonly demand: CsharpNativeDemandAnalysis;
  readonly admitted: (node: Node) => boolean }) {
  const values = new Map<Node, CsharpLambdaBodyEmission>();
  const issues: TargetDiagnostic[] = [];
  const ast = input.source.ast;
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  for (const node of input.nodes) {
    if (!input.admitted(node) || !ast.is.IsArrowFunction(node) && !ast.is.IsFunctionExpression(node)) continue;
    const creation = input.captures.lambdaCreation.get(node);
    if (creation.kind === "discarded") continue;
    const carrier = input.creations.callableTarget.get(node);
    const signature = carrier === undefined ? undefined : input.types.typeEmission.get(carrier)?.lambda;
    if (signature === undefined) { refuse(node, "Lambda emission requires a contextual function/delegate type from TSTS or provider facts before C# emission."); continue; }
    const declaration = ast.as.AsArrowFunction(node) ?? ast.as.AsFunctionExpression(node);
    const contract = input.declarations.callableDeclaration.get(node)?.contract;
    if (contract === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted lambda requires its checked source value parameters.", node);
    const parameters = contract.parameters;
    if (contract.nativeParameters.length > signature.parameters.length) {
      refuse(contract.nativeParameters[signature.parameters.length]?.sourceParameter ?? node,
        "The source lambda declares more parameters than its exact selected C# delegate representation."); continue;
    }
    let nativeIndex = 0;
    for (const parameter of parameters) {
      if (parameter === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted lambda requires its complete checked parameter vector.", node);
      const entry = input.parameters.callableParameter.get(parameter);
      if (entry === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted lambda requires its sealed native parameter layout.", parameter);
      if (entry.incoming.kind === "single" && entry.incoming.rest && signature.restParameterIndex !== nativeIndex)
        refuse(parameter, "A lambda rest parameter requires exact selected delegate rest-parameter evidence before C# emission.");
      const name = ast.name(parameter);
      if (name === undefined || !ast.is.IsIdentifier(name) && !ast.is.IsObjectBindingPattern(name) && !ast.is.IsArrayBindingPattern(name))
        refuse(name ?? parameter, "Lambda parameter binding is outside the current C# planning surface.");
      const selected = input.storage.lambdaParameterType.get(parameter);
      const width = entry.incoming.kind === "tuple" ? entry.incoming.parameters.length : 1;
      const expected = entry.incoming.kind === "tuple"
        ? { kind: "tuple" as const, elements: signature.parameters.slice(nativeIndex, nativeIndex + width) }
        : signature.parameters[nativeIndex]!;
      nativeIndex += width;
      if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted lambda parameter requires its exact sealed delegate representation.", parameter);
      if (!targetTypeRefEquals(selected, expected)) refuse(parameter,
        `The sealed lambda parameter representation '${targetTypeRefKey(selected)}' conflicts with its exact selected C# delegate parameter representation '${targetTypeRefKey(expected)}'.`);
    }
    const result = input.types.typeEmission.get(signature.returnType);
    const asynchronous = HasSyntacticModifier(ast, node, ModifierFlagsAsync);
    if (asynchronous) {
      if (result?.taskResult === undefined) { refuse(node, "Async lambda emission requires a finalized Task/Promise-returning delegate carrier fact before C# emission."); continue; }
      if (input.types.typeEmission.get(result.taskResult) === undefined) { refuse(node, "Async lambda emission requires a renderable Task/Promise result carrier before C# emission."); continue; }
    }
    const body = declaration?.Body;
    const returnTarget = asynchronous ? result?.taskResult : signature.returnType;
    const completion = body === undefined || ast.is.IsBlock(body) ? undefined
      : csharpVoidReturnCompletion(input.values.valueRead.get(body)?.value, returnTarget);
    values.set(node, { completion });
    if (creation.kind !== "quotation") continue;
    if (ast.is.IsFunctionExpression(node)) { refuse(node, "A native expression-tree quotation requires expression-bodied arrow syntax, not a function-expression statement body."); continue; }
    let prepared = body === undefined || ast.is.IsBlock(body) || HasSyntacticModifier(ast, node, ModifierFlagsAsync);
    const pending = body === undefined ? [] : [body];
    while (!prepared && pending.length !== 0) {
      const expression = pending.pop()!;
      const call = input.arguments.targetArgumentsEmission.get(expression);
      const use = input.demand.nativeUse.expression(expression)?.use;
      const signature = use === undefined || use.kind === "erased" ? undefined : input.types.typeEmission.get(use.carrier)?.lambda;
      const nestedCreation = ast.is.IsArrowFunction(expression) || ast.is.IsFunctionExpression(expression) ? input.captures.lambdaCreation.get(expression) : undefined;
      prepared ||= input.captures.captureFrame.get(expression) !== undefined || ast.is.IsClassExpression(expression) || ast.is.IsAwaitExpression(expression) ||
        ast.is.IsSpreadElement(expression) || ast.is.IsSpreadAssignment(expression) ||
        ast.is.IsPostfixUnaryExpression(expression) || use !== undefined && use.kind !== "erased" && use.completion.kind === "never" ||
        nestedCreation !== undefined && nestedCreation.kind !== "inline" && nestedCreation.kind !== "quotation" ||
        signature !== undefined && nestedCreation !== undefined && ast.is.IsBlock((ast.as.AsArrowFunction(expression) ?? ast.as.AsFunctionExpression(expression))?.Body) ||
        call?.reordered === true && call.operands.some(operand => operand.kind !== "argument" ||
          input.constants.nativeConstant.get(operand.expression, operand.parameter.type) !== true);
      if (!prepared) forEachSourceImmediateEvaluationChild(ast, expression, child => pending.push(child));
    }
    if (prepared) refuse(node, "A native expression-tree quotation requires a synchronous expression-bodied lambda without statement preparation.");
  }
  return Object.freeze({ records: createCsharpLambdaEmissionRecords(values), issues: Object.freeze(issues) });
}
