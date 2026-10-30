import type { Node } from "@tsonic/tsts";
import { sourceBindingScope, sourceBindingIterationScope, sourceLexicalCaptures, sourceBindingCapturedBeforeInitialization,
  sourceBindingCapturedBeforeFirstWrite, type TargetSourceProgram } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpStorageIssue } from "../../../target-model/records/storage/storage.js";
import { selectCsharpNamedSelfBinding } from "./named-self.js";
import type { CsharpNativeClosureCapture, CsharpNamedSelfBinding } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpCallableContractIndex } from "../../../target-model/records/callables/callable-values.js";
import { csharpCallableValueType } from "../../../policy/types/callables/value-type.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";

export function analyzeCsharpNativeCaptures(
  source: TargetSourceProgram,
  evidence: CsharpSourceEvidenceIndex,
  physicalType: (declaration: Node, type: TargetTypeRef) => TargetTypeRef,
  issues: CsharpStorageIssue[],
  creationDemand: Pick<ReadonlyMap<Node, boolean>, "get">,
  callables: Pick<CsharpCallableContractIndex, "get" | "closedInputType">,
  erasedStatement: CsharpTargetOperationClassifications["erasedStatement"],
): { readonly lexicalCaptures: readonly CsharpNativeClosureCapture[];
  readonly namedSelfBindings: readonly CsharpNamedSelfBinding[] } {
  const captures: CsharpNativeClosureCapture[] = [];
  const namedSelfBindings: CsharpNamedSelfBinding[] = [];
  const visit = (node: Node): void => {
    if (evidence.compileTimeMetadata.get(node) || erasedStatement.get(node)) return;
    const literal = source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node);
    if (literal) {
      const discarded = creationDemand.get(node);
      if (discarded === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "Native capture selection requires its original checked creation demand.", node);
      if (discarded) return;
    }
    if (literal || source.ast.is.IsFunctionDeclaration(node) && source.ast.body(node) !== undefined) {
      const lexical = sourceLexicalCaptures(node, [node], source.ast, source.navigation, "source");
      const namedSelf = selectCsharpNamedSelfBinding(source, node, lexical, evidence, issues);
      if (namedSelf !== undefined) namedSelfBindings.push(namedSelf);
      const contract = callables.get({ kind: "declaration", declaration: node });
      const protocol = evidence.nodeTargetType.get(node);
      const type = contract === undefined ? undefined : getCsharpMethodValue(protocol) !== undefined
        ? protocol : callables.closedInputType(node) ?? csharpCallableValueType(contract);
      if (type === undefined && literal) {
        const file = source.ast.getSourceFile(node);
        issues.push({ node, code: "CSHARP_CAPTURE_CALLABLE_NOT_CLOSED",
          message: "A native closure requires its exact checked callable contract." +
            ` Source '${file === undefined ? "<missing>" : source.ast.getFileName(file).slice(0, 512)}:${source.ast.pos(node)}-${source.ast.end(node)}'.` });
      }
      const values = lexical.captures.filter(capture => !evidence.compileTimeMetadata.get(capture.declaration)).map(capture => {
        const logical = evidence.storageTargetType.get(capture.declaration) ?? evidence.nodeTargetType.get(capture.declaration);
        const scope = sourceBindingScope(capture.declaration, source.ast);
        if (logical === undefined || scope === undefined) {
          const iteration = sourceBindingIterationScope(capture.declaration, source.ast) === scope;
          const owner = scope === undefined ? undefined : source.ast.parent(scope);
          issues.push({ node: capture.declaration, code: iteration ? "CSHARP_ITERATION_CAPTURE_NOT_CLOSED"
            : owner !== undefined && source.ast.is.IsConstructorDeclaration(owner) ? "CSHARP_CONSTRUCTOR_CAPTURE_NOT_CLOSED"
            : "CSHARP_CAPTURE_CALLABLE_NOT_CLOSED",
            message: "A native closure requires its original captured place and exact physical storage type." });
          return undefined;
        }
        return Object.freeze({ declaration: capture.declaration, scope, type: physicalType(capture.declaration, logical),
          references: Object.freeze([...capture.references]),
          mutable: source.navigation.declarationUseSummary(capture.declaration).bindingWritten,
          initialization: sourceBindingCapturedBeforeInitialization(capture.declaration, source.ast, source.navigation) ||
            sourceBindingCapturedBeforeFirstWrite(capture.declaration, source.ast, source.navigation)
            ? "deferred" as const : "initialized" as const });
      });
      const receivers = lexical.receivers.map(receiver => {
        const reference = receiver.references[0];
        const type = reference === undefined ? undefined : evidence.nodeTargetType.get(reference);
        if (type === undefined) {
          issues.push({ node: receiver.owner, code: "CSHARP_CAPTURE_CALLABLE_NOT_CLOSED",
            message: "A native closure requires its exact checked receiver and native storage type." });
          return undefined;
        }
        return Object.freeze({ owner: receiver.owner, references: Object.freeze([...receiver.references]), type });
      });
      if (type !== undefined && values.every(value => value !== undefined) && receivers.every(receiver => receiver !== undefined)) {
        captures.push(Object.freeze({ owner: node, type, values: Object.freeze(values), receivers: Object.freeze(receivers) }));
      }
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  return Object.freeze({ lexicalCaptures: Object.freeze(captures), namedSelfBindings: Object.freeze(namedSelfBindings) });
}
