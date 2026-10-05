import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import { getCsharpLocalBindingName } from "../../bindings/binding-state.js";
import { planCsharpFrameClosureReference } from "../../bindings/capture-closures.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { getCsharpDelegateSignature } from "../../../../target-model/types/delegates.js";

export function planCsharpLexicalFunctionValues(
  children: readonly Node[], sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
): ReadonlyMap<Node, readonly CsharpStatement[]> {
  const statements = new Map<Node, CsharpStatement[]>();
  const { ast } = input.program.source;
  for (const statement of children) for (const declaration of input.program.captureStorage.valueDeclarationsAt(statement)) {
    const references = input.program.sourceNavigation.declarationUseSummary(declaration).uses
      .filter(use => use.kind === "first-class" && !input.program.sourceEvidence.isCompileTimeMetadata(use.reference));
    if (references.length === 0) continue;
    const carrier = input.types.classifications.resolveNode(declaration, sourceFile);
    const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
    const functionName = ast.name(declaration);
    const methodName = functionName === undefined ? undefined : getCsharpLocalBindingName(functionName, input, state);
    if (type === undefined || getCsharpDelegateSignature(carrier) === undefined || methodName === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declaration, "A lexical function requires one exact checked native delegate contract."));
      continue;
    }
    const expression = input.program.captureStorage.closure(declaration) === undefined
      ? { kind: "IdentifierName" as const, name: methodName }
      : planCsharpFrameClosureReference(declaration, input, diagnostics, state);
    if (expression === undefined) continue;
    const initializer: CsharpExpression = { kind: "ObjectCreationExpression", type,
      arguments: [{ kind: "Argument", expression }] };
    const creation = input.program.captureStorage.valueCreation(declaration);
    if (creation?.kind === "resolved" && creation.inlineReference !== undefined) {
      state.expressionOverrides.set(creation.inlineReference, initializer);
      continue;
    }
    const name = input.program.captureStorage.valueName(declaration);
    if (name === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declaration, "A lexical callable owner requires its stable analyzed storage name."));
      continue;
    }
    for (const reference of references) state.expressionOverrides.set(reference.reference, { kind: "IdentifierName", name });
    const scheduled = statements.get(statement) ?? [];
    scheduled.push({ kind: "LocalDeclarationStatement", type, name,
      initializer });
    statements.set(statement, scheduled);
  }
  return statements;
}
