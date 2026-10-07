import type { Node } from "@tsonic/tsts";
import { sourceCallableDefinitionIsDiscarded, sourceBindingScope, sourceBindingCapturedBeforeInitialization, sourceLexicalCaptures,
  type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/model.js";
import type { CsharpStorageIssue } from "../storage/model.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import type { CsharpFrameClosure } from "./capture-closures.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

const maximumGenericClosureCaptures = 131_072;

export function selectCsharpGenericFrameClosures(
  source: TargetSourceProgram, evidence: CsharpSourceEvidenceIndex,
  groups: Map<Node, Map<Node, TargetTypeRef>>,
  physicalType: (declaration: Node, type: TargetTypeRef) => TargetTypeRef,
  issues: CsharpStorageIssue[],
): readonly CsharpFrameClosure[] {
  const selected: CsharpFrameClosure[] = [];
  let capturesCount = 0;
  let exhausted = false;
  const visit = (node: Node): void => {
    if (exhausted || evidence.isCompileTimeMetadata(node)) return;
    if ((source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) &&
      sourceCallableDefinitionIsDiscarded(node, source.ast)) return;
    if ((source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) && source.ast.typeParameters(node).length > 0) {
      const type = evidence.nodeTargetType(node);
      const method = getCsharpMethodValue(type);
      if (type === undefined || method === undefined || method.typeParameters.length !== source.ast.typeParameters(node).length) {
        issues.push({ node, code: "CSHARP_GENERIC_CALLABLE_CONTRACT_NOT_CLOSED",
          message: "A generic callable value requires its exact quantified native invocation contract." });
      } else {
        const lexical = sourceLexicalCaptures(node, [node], source.ast, source.navigation);
        const captures = lexical.captures.filter(capture => !evidence.isCompileTimeMetadata(capture.declaration));
        capturesCount += captures.length + lexical.receivers.length + 1;
        if (capturesCount > maximumGenericClosureCaptures) {
          exhausted = true;
          issues.push({ node, code: "CSHARP_GENERIC_CALLABLE_CAPTURE_LIMIT_EXCEEDED",
            message: `Generic callable capture analysis exceeds its ${maximumGenericClosureCaptures}-entry budget.` });
          return;
        }
        const bindings = captures.map(capture => {
          const type = evidence.storageTargetType(capture.declaration) ?? evidence.nodeTargetType(capture.declaration);
          const scope = sourceBindingScope(capture.declaration, source.ast);
          return type === undefined || scope === undefined ? undefined : { declaration: capture.declaration, scope,
            type: physicalType(capture.declaration, type),
            shared: source.navigation.declarationUseSummary(capture.declaration).bindingWritten ||
              sourceBindingCapturedBeforeInitialization(capture.declaration, source.ast, source.navigation),
          };
        });
        const receivers = lexical.receivers.map(receiver => {
          const reference = receiver.references[0];
          const type = reference === undefined ? undefined : evidence.nodeTargetType(reference);
          return type === undefined ? undefined : { owner: receiver.owner, references: receiver.references, type };
        });
        if (bindings.some(binding => binding === undefined) || receivers.some(receiver => receiver === undefined)) {
          issues.push({ node, code: "CSHARP_GENERIC_CALLABLE_CAPTURE_NOT_CLOSED",
            message: "A generic callable value requires exact captured binding, receiver and physical storage contracts." });
        } else {
          for (const binding of bindings) {
            if (!binding!.shared) continue;
            const group = groups.get(binding!.scope) ?? new Map<Node, TargetTypeRef>();
            const previous = group.get(binding!.declaration);
            if (previous !== undefined && !targetTypeRefEquals(previous, binding!.type)) {
              issues.push({ node: binding!.declaration, code: "CSHARP_CAPTURE_STORAGE_CONFLICT",
                message: "One captured binding cannot have incompatible physical storage contracts." });
            }
            group.set(binding!.declaration, binding!.type);
            groups.set(binding!.scope, group);
          }
          selected.push(Object.freeze({ declaration: node, scope: node, methodName: method.method, type,
            captures: Object.freeze(bindings.map(binding => binding!.declaration)),
            receivers: Object.freeze(receivers as NonNullable<typeof receivers[number]>[]),
          }));
        }
      }
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  const activations = new Map<Node, CsharpFrameClosure[]>();
  for (const method of selected) {
    const declaration = source.ast.parent(method.declaration);
    const list = declaration === undefined ? undefined : source.ast.parent(declaration);
    if (declaration === undefined || !source.ast.is.IsVariableDeclaration(declaration) ||
        source.ast.as.AsVariableDeclaration(declaration)?.Initializer !== method.declaration ||
        list === undefined || source.ast.variableDeclarationKind(list) !== "const") continue;
    const creationScope = sourceBindingScope(declaration, source.ast);
    const captureScopes = new Set(method.captures.map(capture => sourceBindingScope(capture, source.ast)));
    const scope = captureScopes.size === 1 ? [...captureScopes][0] : undefined;
    if (scope === undefined || scope !== creationScope && source.ast.body(scope) !== creationScope ||
        !method.captures.some(capture => groups.get(scope)?.has(capture))) continue;
    const methods = activations.get(scope) ?? [];
    methods.push(method);
    activations.set(scope, methods);
  }
  const activationByDeclaration = new Map<Node, Node>();
  for (const [scope, methods] of activations) {
    if (methods.length !== 1) continue;
    const method = methods[0]!;
    const group = groups.get(scope)!;
    for (const capture of method.captures) {
      const type = evidence.storageTargetType(capture) ?? evidence.nodeTargetType(capture);
      if (type !== undefined) group.set(capture, physicalType(capture, type));
    }
    activationByDeclaration.set(method.declaration, scope);
  }
  return Object.freeze(selected.map(method => Object.freeze({
    ...method, scope: activationByDeclaration.get(method.declaration) ?? method.scope,
  })));
}
