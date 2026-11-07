import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpStorageIssue } from "../../../target-model/records/storage/storage.js";
import { selectCsharpNamedSelfBinding } from "./named-self.js";
import type { CsharpNativeClosureCapture, CsharpNamedSelfBinding } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpCallableContractIndex } from "../../../target-model/records/callables/callable-values.js";
import { csharpCallableDeclarationValueType } from "../../../policy/types/callables/value-type.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";
import { readCsharpSelectedWritingReference } from "./argument-passing.js";
import { csharpCapturedBindingInitialization } from "./capture-initialization.js";
import { csharpLexicalCaptures } from "./lexical-captures.js";

export function csharpCaptureSubtreeIsErased(
  node: Node,
  evidence: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata">,
  erasedStatement: CsharpTargetOperationClassifications["erasedStatement"],
): boolean {
  return evidence.compileTimeMetadata.get(node) === true || erasedStatement.get(node) === true;
}

export function analyzeCsharpNativeCaptures(
  source: TargetSourceProgramFacts,
  evidence: CsharpSourceEvidenceIndex,
  physicalType: (declaration: Node, type: TargetTypeRef) => TargetTypeRef,
  issues: CsharpStorageIssue[],
  creationDemand: Pick<ReadonlyMap<Node, boolean>, "get">,
  callables: Pick<CsharpCallableContractIndex, "get" | "closedInputType">,
  erasedStatement: CsharpTargetOperationClassifications["erasedStatement"],
  selectedCalls: Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">,
): { readonly lexicalCaptures: readonly CsharpNativeClosureCapture[];
  readonly namedSelfBindings: readonly CsharpNamedSelfBinding[] } {
  const captures: CsharpNativeClosureCapture[] = [];
  const namedSelfBindings: CsharpNamedSelfBinding[] = [];
  const visit = (node: Node): void => {
    if (csharpCaptureSubtreeIsErased(node, evidence, erasedStatement)) return;
    const literal = source.syntax.is.IsArrowFunction(node) || source.syntax.is.IsFunctionExpression(node);
    if (literal) {
      const discarded = creationDemand.get(node);
      if (discarded === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "Native capture selection requires its original checked creation demand.", node);
      if (discarded) return;
    }
    if (literal || source.syntax.is.IsFunctionDeclaration(node) && source.syntax.body(node) !== undefined) {
      const lexical = csharpLexicalCaptures(source.facts, node);
      const namedSelf = selectCsharpNamedSelfBinding(source, node, lexical, evidence, issues);
      if (namedSelf !== undefined) namedSelfBindings.push(namedSelf);
      const contract = callables.get({ kind: "declaration", declaration: node });
      const protocol = evidence.nodeTargetType.get(node);
      const type = contract === undefined ? undefined : getCsharpMethodValue(protocol) !== undefined
        ? protocol : csharpCallableDeclarationValueType(callables, node);
      if (type === undefined && literal) {
        issues.push({ node, code: "CSHARP_CAPTURE_CALLABLE_NOT_CLOSED",
          message: "A native closure requires its exact checked callable contract." });
      }
      const values = lexical.captures.filter(capture => !evidence.compileTimeMetadata.get(capture.declaration)).map(capture => {
        const logical = evidence.storageTargetType.get(capture.declaration) ?? evidence.nodeTargetType.get(capture.declaration);
        const scope = source.facts.navigation.scopes.bindingScope(capture.declaration);
        if (logical === undefined || scope === undefined) {
          const iteration = source.facts.navigation.scopes.iterationScope(capture.declaration) === scope;
          const owner = scope === undefined ? undefined : source.syntax.parent(scope);
          issues.push({ node: capture.declaration, code: iteration ? "CSHARP_ITERATION_CAPTURE_NOT_CLOSED"
            : owner !== undefined && source.syntax.is.IsConstructorDeclaration(owner) ? "CSHARP_CONSTRUCTOR_CAPTURE_NOT_CLOSED"
            : "CSHARP_CAPTURE_CALLABLE_NOT_CLOSED",
            message: "A native closure requires its original captured place and exact physical storage type." });
          return undefined;
        }
        return Object.freeze({ declaration: capture.declaration, scope, type: physicalType(capture.declaration, logical),
          references: Object.freeze([...capture.references]),
          mutable: source.facts.navigation.uses.summary(capture.declaration).bindingWritten ||
            source.facts.navigation.uses.summary(capture.declaration).uses.some(use =>
              readCsharpSelectedWritingReference(source, evidence, selectedCalls, use.reference) !== undefined),
          initialization: csharpCapturedBindingInitialization(capture.declaration, source.facts.analyses) });
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
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) visit(file);
  return Object.freeze({ lexicalCaptures: Object.freeze(captures), namedSelfBindings: Object.freeze(namedSelfBindings) });
}
