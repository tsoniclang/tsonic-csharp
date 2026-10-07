import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/roslyn/index.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import { planIdentifierExpression } from "../../expressions/expression-source-references.js";
import { planCsharpDelegateAdaptationBody } from "../../expressions/delegate-adapters.js";
import { applyCsharpConversionSelection } from "../../expressions/conversions.js";
import { getCsharpDelegateSignature } from "../../../../target-model/types/delegates.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { isCsharpNullableReferenceTargetType } from "../../../../target-model/types/nullable.js";

export function withCsharpDelegateAdapterDeclarations(block: Node, input: CsharpPlanningContext): CsharpPlanningContext {
  const identities = input.program.conversions.delegateAdapters(block);
  if (identities.length === 0) return input;
  const adapters = new Map(input.scope.delegateAdapters);
  for (const identity of identities) adapters.set(identity, input.names.temporaryName("__tsonic_adapter"));
  return { ...input, scope: { ...input.scope, delegateAdapters: adapters } };
}

export function planCsharpDelegateAdapterDeclarations(block: Node, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState): readonly CsharpStatement[] {
  const statements: CsharpStatement[] = [];
  for (const identity of input.program.conversions.delegateAdapters(block)) {
    const identifier = input.program.source.ast.name(identity.declaration);
    const name = input.scope.delegateAdapters?.get(identity);
    const signature = getCsharpDelegateSignature(identity.target);
    const returnType = signature === undefined ? undefined : csharpTypeFromTargetTypeRef(signature.returnType, input.scope.typeParameterNames);
    const callee = identifier === undefined ? undefined : planIdentifierExpression(identifier, sourceFile, input, diagnostics, state);
    if (name === undefined || callee === undefined || returnType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(identity.declaration, "A retained native delegate adapter requires its exact lexical binding, name and return signature."));
      continue;
    }
    const storage = input.program.storage.type(identity.declaration);
    const presentCallee: CsharpExpression = isCsharpNullableReferenceTargetType(storage)
      ? { kind: "PostfixUnaryExpression", operand: callee, operatorToken: { kind: "ExclamationToken" } } : callee;
    const method = planCsharpDelegateAdaptationBody(identifier!, sourceFile, input, diagnostics,
      identity.source, identity.target, identity.selection, presentCallee, applyCsharpConversionSelection);
    if (method === undefined || method.body.kind !== "Block" || method.parameters.some(parameter => parameter.type === undefined)) continue;
    statements.push({ kind: "LocalFunctionStatement", name, returnType, modifiers: [],
      parameters: method.parameters as NonNullable<Extract<CsharpStatement, { kind: "LocalFunctionStatement" }>["parameters"]>,
      body: method.body });
  }
  return statements;
}
