import { admitCsharpExpectedBinarySelection } from "../../policy/operations/operators/expected-binary.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpBinaryOperation } from "../operations/operators.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callable-values.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/type-projections.js";
import { createCsharpExpectedUseCollection } from "./collection.js";
import { createCsharpExpectedReturnTargets } from "./return-targets.js";
import { createCsharpExpectedConstructUses } from "./construct-uses.js";
import { createCsharpExpectedTypePropagation, type CsharpExpectedBinarySelection } from "./propagation.js";
import { collectCsharpExpectedNativeUseSites } from "./native-uses.js";
import type { CsharpExpectedTypeAnalysis, CsharpExpectedTypeAnalysisInput } from "./model.js";

export function analyzeCsharpExpectedTypes(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  objectShapes: CsharpObjectShapeClassifications,
  callables: CsharpCallableContractIndex,
  valueReadStages: CsharpValueReadStageIndex,
  declarations: Pick<CsharpDeclarationClassifications, "returnContract" | "runtimeDefault">,
  typeProjections: CsharpGenericProjectionIndex,
): CsharpExpectedTypeAnalysis {
  const input: CsharpExpectedTypeAnalysisInput = { policy, evidence, operations, objectShapes, callables, valueReadStages, declarations, typeProjections };
  const collection = createCsharpExpectedUseCollection(policy);
  const returnTargets = createCsharpExpectedReturnTargets(input, collection);
  const constructUses = createCsharpExpectedConstructUses(input, collection);
  const expectedBinaries = new WeakMap<Node, Map<string, CsharpExpectedBinarySelection>>();
  const propagation = createCsharpExpectedTypePropagation(input, collection, classifyExpectedBinary);
  for (const sourceFile of policy.sourceFiles) visit(sourceFile, sourceFile);
  let changed = true;
  while (changed) {
    drainPending();
    changed = returnTargets.refreshCallableTargets();
    if (changed) for (const sourceFile of policy.sourceFiles) visit(sourceFile, sourceFile);
  }
  returnTargets.recordReturnDemands();
  drainPending();
  const projection = collection.seal();
  const returns = returnTargets.seal();
  const constructions = propagation.seal();
  return Object.freeze({
    nativeUseSites: collectCsharpExpectedNativeUseSites(projection.requests),
    constructions,
    issues: collection.issues,
    targetTypes: projection.targetTypes,
    expectedType: Object.freeze({ get: projection.expectedType }),
    requiredExpectedType: Object.freeze({ get: projection.requiredExpectedType }),
    returnContext: Object.freeze({ get: returns.returnContext }),
    exactIntegerConversion: Object.freeze({ get: projection.exactIntegerConversion }),
    storageExpectedType: Object.freeze({ get: projection.storageExpectedType }),
    callableTarget: Object.freeze({ get: returns.callableTarget }),
    arrayLiteralCarrier: Object.freeze({ get: constructions.arrayLiteralCarrier }),
    expectedBinary: Object.freeze({ get: (expression: Node, targetType: TargetTypeRef) =>
      expectedBinaries.get(expression)?.get(targetTypeRefKey(targetType)) }),
  });

  function drainPending(): void {
    for (let pending = collection.takePending(); pending !== undefined; pending = collection.takePending()) propagation.propagate(pending);
  }

  function visit(node: Node, sourceFile: SourceFile): void {
    if (evidence.compileTimeMetadata.get(node) || operations.nativeUnreachable.get(node)) return;
    returnTargets.recordTypeParameter(node);
    returnTargets.recordAccessorReturnContext(node);
    constructUses.recordInitializer(node);
    returnTargets.recordReturnExpression(node);
    returnTargets.recordExpressionBodyReturn(node);
    constructUses.recordThrownValue(node);
    const contextualType = evidence.contextualType.get(node);
    collection.record(node, contextualType === undefined ? undefined : evidence.semanticTargetType.get(contextualType, sourceFile), "contextual");
    propagation.recordIntrinsicArrayLiteralElements(node);
    propagation.recordIntrinsicObjectLiteralMembers(node);
    if (!constructUses.recordOperationUses(node, sourceFile)) return;
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child, sourceFile); });
  }

  function classifyExpectedBinary(expression: Node, targetType: TargetTypeRef): CsharpExpectedBinarySelection {
    const key = targetTypeRefKey(targetType);
    let targets = expectedBinaries.get(expression);
    if (targets === undefined) { targets = new Map(); expectedBinaries.set(expression, targets); }
    const existing = targets.get(key);
    if (targets.has(key)) return existing;
    const contextual = selectCsharpBinaryOperation(policy, expression, evidence.nodeTargetType.get, targetType);
    const selection = admitCsharpExpectedBinarySelection(targetType, contextual, operations.binaryOperation.get(expression)?.target);
    targets.set(key, selection);
    return selection;
  }
}
