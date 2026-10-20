import { classifyCsharpClassPropertyStorage } from "./class-property-storage.js";

import { createCsharpOperationErasure, type CsharpOperationErasureIndexes } from "./statement-erasure.js";

import { analyzeCsharpNativeHandlers } from "./native-handlers.js";
import type { CsharpRequiredRecord } from "../program/records/required-records.js";

import type { Node } from "@tsonic/tsts";

import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpTargetOperationClassifications, CsharpOperationIssue } from "../../target-model/records/operations.js";
import { composeCsharpBinaryExecutionDriver } from "../../target-model/metadata/binary-execution-drivers.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";

import { optionalResultType } from "../../policy/operations/members/optional-results.js";

import { createCsharpOperationProducer, type CsharpOperationProducer } from "../program/records/operations.js";
import { analyzeCsharpOperationConstruct } from "./constructs.js";

export function analyzeCsharpTargetOperations(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  erasureIndexes: CsharpOperationErasureIndexes,
  nodes: readonly Node[],
  requirements: CsharpRequiredRecord[],
): CsharpTargetOperationClassifications {
  const producer = createCsharpOperationProducer();
  const classPropertyStorage = classifyCsharpClassPropertyStorage(policy, evidence);
  const binaryExecutionDrivers: import("../../target-model/metadata/provider-metadata.js").CsharpTargetBinaryExecutionDriver[] = [];
  const issues: CsharpOperationIssue[] = [];
  const erasure = createCsharpOperationErasure(policy.ast, erasureIndexes, issues);
  for (const sourceFile of policy.sourceFiles) analyzeCsharpOperationConstruct(sourceFile, sourceFile,
    policy, evidence, erasure, producer, binaryExecutionDrivers, issues);
  const nativeHandler = analyzeCsharpNativeHandlers(nodes, {
    memoryBinding: producer.memoryBinding,
    safetyOperation: erasure.safetyApplications.safetyOperation,
    jsStringConversion: producer.jsStringConversion,
    nativePointer: producer.nativePointer,
    typedLocation: producer.typedLocation,
  }, requirements);
  for (const subject of producer.resultSubjects) {
    producer.operationResult.selected(subject, operationResultType(producer, subject));
    producer.sourceMember.selected(subject, producer.property.get(subject)?.sourceOwned ?? producer.element.get(subject)?.sourceOwned);
  }
  return producer.seal({ issues, classPropertyStorage, nativeHandler,
    binaryExecutionDriver: composeCsharpBinaryExecutionDriver(...binaryExecutionDrivers) });
}

function operationResultType(
  producer: CsharpOperationProducer,
  node: Node,
): import("../../target-model/types/model.js").TargetTypeRef | undefined {
  const binding = producer.memoryBinding.get(node);
  if (binding !== undefined && binding.kind !== "rejected") return binding.type;
  const mutation = producer.jsArrayMutation.get(node);
  if (mutation?.kind === "set-typed-element" || mutation?.kind === "update-typed-element") return mutation.resultType;
  const call = producer.call.get(node);
  if (call?.selectedResultType !== undefined) {
    return call.selectedResultType;
  }
  const construction = producer.construction.get(node);
  if (construction?.selectedResultType !== undefined) {
    return construction.selectedResultType;
  }
  const property = producer.property.get(node);
  if (property?.selection.kind === "union-property") return property.selection.resultCarrier;
  if (property?.selection.kind === "resolved") {
    return optionalResultType(
      property.selection.targetMember.returnType,
      property.selection.source.optionalChain,
    );
  }
  if (property?.sourceOwned !== undefined) {
    return property.sourceOwned.jsValueOperation.kind === "resolved"
      ? property.sourceOwned.jsValueOperation.resultType
      : property.sourceOwned.selectedReadType;
  }
  const element = producer.element.get(node);
  if (element?.jsValue.kind === "resolved") {
    return element.jsValue.resultType;
  }
  if (element?.target?.kind === "resolved") {
    return optionalResultType(
      element.target.targetMember.returnType,
      element.target.source.optionalChain,
    );
  }
  if (element?.selectedResultType !== undefined) {
    return element.selectedResultType;
  }
  const binary = producer.binary.get(node);
  if (binary?.destructuring.kind === "resolved") {
    return binary.destructuring.resultType;
  }
  if (binary?.jsValue.kind === "resolved") {
    return binary.jsValue.resultType;
  }
  if (binary?.target.kind === "resolved") {
    return binary.target.resultType;
  }
  const unary = producer.unary.get(node);
  if (unary?.jsValue.kind === "resolved") {
    return unary.jsValue.resultType;
  }
  return unary?.target.kind === "resolved"
    ? unary.target.resultType
    : undefined;
}
