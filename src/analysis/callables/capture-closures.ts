import type { Node } from "@tsonic/tsts";
import { sourceBindingScope, sourceLexicalCaptures, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/model.js";
import type { CsharpStorageIssue } from "../storage/model.js";

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
): readonly CsharpFrameClosure[] {
  if (groups.size === 0) return [];
  const candidates: Node[] = [];
  const visit = (node: Node): void => {
    if (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) candidates.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  const captures = candidates.map(declaration => ({ declaration,
    selected: sourceLexicalCaptures(declaration, [declaration], source.ast, source.navigation),
  }));
  const selected = new Map<Node, CsharpFrameClosure>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of captures) {
      if (selected.has(candidate.declaration) || !candidate.selected.captures.some(capture => {
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
      while (scope !== undefined && !scopes.has(scope)) scope = source.ast.parent(scope);
      if (scope === undefined) {
        issues.push({ node: candidate.declaration, code: "CSHARP_CAPTURE_CALLABLE_SCOPE_NOT_CLOSED",
          message: "A captured callable requires an enclosing native frame activation." });
        continue;
      }
      for (const binding of bindings) {
        const group = groups.get(binding!.scope) ?? new Map<Node, TargetTypeRef>();
        group.set(binding!.declaration, binding!.type);
        groups.set(binding!.scope, group);
      }
      selected.set(candidate.declaration, Object.freeze({ declaration: candidate.declaration, scope,
        methodName: `invoke${selected.size}`, type, captures: Object.freeze(bindings.map(binding => binding!.declaration)),
        receivers: Object.freeze(receivers as NonNullable<typeof receivers[number]>[]),
      }));
      changed = true;
    }
  }
  return Object.freeze([...selected.values()]);
}
