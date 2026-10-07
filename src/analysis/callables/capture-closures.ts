import type { Node } from "@tsonic/tsts";
import { sourceCallableDefinitionIsDiscarded, sourceCallableValueExpression, sourceBindingScope, sourceBindingIterationScope, sourceLexicalCaptures, sourceBindingCapturedBeforeInitialization, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/model.js";
import type { CsharpStorageIssue } from "../storage/model.js";
import { selectCsharpNamedSelfBinding, type CsharpNamedSelfBinding } from "./named-self.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { CsharpDeclarationClassifications } from "../declarations/model.js";
import type { CsharpStorageClassifications } from "../storage/model.js";
import { csharpConstructorRequiresPreparation } from "./constructor-entry.js";

export interface CsharpFrameClosure {
  readonly declaration: Node;
  readonly scope: Node;
  readonly methodName: string;
  readonly type: TargetTypeRef;
  readonly captures: readonly Node[];
  readonly receivers: readonly { readonly owner: Node; readonly references: readonly Node[]; readonly type: TargetTypeRef }[];
}

export function selectCsharpFrameClosures(
  source: TargetSourceProgram,
  evidence: CsharpSourceEvidenceIndex,
  groups: Map<Node, Map<Node, TargetTypeRef>>,
  physicalType: (declaration: Node, type: TargetTypeRef) => TargetTypeRef,
  issues: CsharpStorageIssue[],
  valueOwned: ReadonlySet<Node>,
  constructorEntry: {
    readonly declarations: Pick<CsharpDeclarationClassifications, "runtimeDefault">;
    readonly storage: Pick<CsharpStorageClassifications, "nativeBacking" | "requiresTypedLocationIdentity">;
  },
): { readonly closures: readonly CsharpFrameClosure[]; readonly namedSelfBindings: readonly CsharpNamedSelfBinding[];
  readonly captureFreeDeclarations: readonly Node[] } {
  const candidates: Node[] = [];
  const visit = (node: Node): void => {
    if (evidence.isCompileTimeMetadata(node)) return;
    if ((source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) &&
      sourceCallableDefinitionIsDiscarded(node, source.ast)) return;
    if (!valueOwned.has(node) && (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node) ||
      source.ast.is.IsFunctionDeclaration(node) && source.ast.parent(node) !== undefined &&
      !source.ast.is.IsSourceFile(source.ast.parent(node)!))) candidates.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  const captures = candidates.map(declaration => {
    const lexical = sourceLexicalCaptures(declaration, [declaration], source.ast, source.navigation);
    return { declaration, namedSelf: selectCsharpNamedSelfBinding(source, declaration, lexical, evidence, issues), selected: { ...lexical,
      captures: lexical.captures.filter(capture => !evidence.isCompileTimeMetadata(capture.declaration)),
    } };
  });
  const namedSelfDeclarations = new Set(captures.flatMap(candidate => candidate.namedSelf === undefined ? [] : [candidate.declaration]));
  const retainBinding = (declaration: Node, scope: Node, type: TargetTypeRef): boolean => {
    const bindings = groups.get(scope) ?? new Map<Node, TargetTypeRef>();
    const previous = bindings.get(declaration);
    if (previous !== undefined) {
      if (targetTypeRefEquals(previous, type)) return true;
      issues.push({ node: declaration, code: "CSHARP_CAPTURE_STORAGE_CONFLICT",
        message: "One captured binding cannot have incompatible physical storage contracts." });
      return false;
    }
    bindings.set(declaration, type);
    groups.set(scope, bindings);
    return true;
  };
  for (const candidate of captures) for (const capture of candidate.selected.captures) {
    const scope = sourceBindingScope(capture.declaration, source.ast);
    const iteration = scope !== undefined && sourceBindingIterationScope(capture.declaration, source.ast) === scope;
    const constructor = scope === undefined ? undefined : source.ast.parent(scope);
    let binding = capture.declaration;
    while (source.ast.is.IsBindingElement(binding)) {
      const pattern = source.ast.parent(binding);
      const owner = pattern === undefined ? undefined : source.ast.parent(pattern);
      if (owner === undefined) break;
      binding = owner;
    }
    const prepared = constructor !== undefined && source.ast.is.IsConstructorDeclaration(constructor) &&
      source.ast.is.IsParameterDeclaration(binding) && source.ast.parent(binding) === constructor &&
      constructorEntry.storage.nativeBacking(capture.declaration) === undefined &&
      csharpConstructorRequiresPreparation(source.ast, constructor, constructorEntry.declarations, constructorEntry.storage,
        parameter => groups.get(scope!)?.has(parameter) === true);
    const selfInitializer = source.ast.is.IsVariableDeclaration(capture.declaration) &&
      sourceCallableValueExpression(source.ast, source.ast.as.AsVariableDeclaration(capture.declaration)?.Initializer) === candidate.declaration;
    if (!iteration && !prepared && !selfInitializer && !sourceBindingCapturedBeforeInitialization(capture.declaration, source.ast, source.navigation)) continue;
    const type = evidence.storageTargetType(capture.declaration) ?? evidence.nodeTargetType(capture.declaration);
    if (scope === undefined || type === undefined) {
      issues.push({ node: capture.declaration,
        code: iteration ? "CSHARP_ITERATION_CAPTURE_NOT_CLOSED"
          : prepared ? "CSHARP_CONSTRUCTOR_CAPTURE_NOT_CLOSED" : "CSHARP_DEFERRED_CAPTURE_NOT_CLOSED",
        message: iteration
          ? "Iteration capture requires its exact native binding type and activation."
          : prepared ? "Constructor capture requires its exact native binding type and preparation activation."
          : "Deferred captured initialization requires its exact native binding type and activation." });
      continue;
    }
    retainBinding(capture.declaration, scope, physicalType(capture.declaration, type));
  }
  const selected = new Map<Node, CsharpFrameClosure>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of captures) {
      if (selected.has(candidate.declaration) || (candidate.namedSelf?.values.length ?? 0) > 0 ||
        candidate.selected.captures.some(capture => namedSelfDeclarations.has(capture.declaration)) || !candidate.selected.captures.some(capture => {
        const scope = sourceBindingScope(capture.declaration, source.ast);
        return scope !== undefined && groups.get(scope)?.has(capture.declaration);
      })) continue;
      const bindings = candidate.selected.captures.map(capture => {
        const scope = sourceBindingScope(capture.declaration, source.ast);
        const logicalType = evidence.storageTargetType(capture.declaration) ?? evidence.nodeTargetType(capture.declaration);
        return scope === undefined || logicalType === undefined ? undefined : {
          declaration: capture.declaration, scope, type: physicalType(capture.declaration, logicalType),
        };
      });
      const type = evidence.nodeTargetType(candidate.declaration);
      const receivers = candidate.selected.receivers.map(receiver => {
        const reference = receiver.references[0];
        const type = reference === undefined ? undefined : evidence.nodeTargetType(reference);
        return reference === undefined || type === undefined ? undefined : { owner: receiver.owner, references: receiver.references, type };
      });
      if (type === undefined || bindings.some(binding => binding === undefined) || receivers.some(receiver => receiver === undefined)) {
        issues.push({ node: candidate.declaration, code: "CSHARP_CAPTURE_CALLABLE_NOT_CLOSED",
          message: "A callable sharing captured storage requires exact binding, receiver and delegate types." });
        continue;
      }
      const scopes = new Set(bindings.map(binding => binding!.scope));
      let scope = source.ast.parent(candidate.declaration);
      while (scope !== undefined && !scopes.has(scope)) {
        const body = source.ast.body(scope);
        if (body !== undefined && scopes.has(body)) { scope = body; break; }
        scope = source.ast.parent(scope);
      }
      if (scope === undefined) {
        issues.push({ node: candidate.declaration, code: "CSHARP_CAPTURE_CALLABLE_SCOPE_NOT_CLOSED",
          message: "A captured callable requires an enclosing native frame activation." });
        continue;
      }
      if (!bindings.every(binding => retainBinding(binding!.declaration, binding!.scope, binding!.type))) continue;
      selected.set(candidate.declaration, Object.freeze({ declaration: candidate.declaration, scope,
        methodName: `invoke${selected.size}`, type, captures: Object.freeze(bindings.map(binding => binding!.declaration)),
        receivers: Object.freeze(receivers as NonNullable<typeof receivers[number]>[]),
      }));
      changed = true;
    }
  }
  return Object.freeze({ closures: Object.freeze([...selected.values()]),
    namedSelfBindings: Object.freeze(captures.flatMap(candidate => candidate.namedSelf === undefined ? [] : [candidate.namedSelf])),
    captureFreeDeclarations: Object.freeze(captures.filter(candidate =>
      candidate.selected.captures.length === 0 && candidate.selected.receivers.length === 0).map(candidate => candidate.declaration)),
  });
}
