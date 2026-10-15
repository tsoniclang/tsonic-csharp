import type { Node, SourceFile } from "@tsonic/tsts";
import { Node_Text } from "@tsonic/target-api/source";
import {
  createTargetClassificationKey,
  createTargetUseClassificationBuilder,
  targetUseSiteRef,
} from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { targetTypeRefKey } from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type {
  CsharpObjectShapeClassifications,
} from "../objects/index.js";
import type {
  CsharpCallableContractIndex,
} from "../callables/index.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import {
  selectCsharpBinaryOperation,
} from "../../policy/operations/index.js";
import { csharpBinarySelectionsEqual } from "./binary-equality.js";
import {
  csharpTargetRepresentationContractId,
} from "../../target-model/identities/identities.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import { createCsharpExpectedUseCollection } from "./collection.js";
import { createCsharpExpectedReturnTargets } from "./return-targets.js";
import { createCsharpExpectedConstructUses } from "./construct-uses.js";
import { createCsharpExpectedTypePropagation, type CsharpExpectedBinarySelection } from "./propagation.js";
import { admitCsharpExpectedNativeUses } from "./native-uses.js";
import type { CsharpExpectedTypeAnalysisInput } from "./model.js";

const expectedBinaryKey = createTargetClassificationKey<
  ReturnType<typeof selectCsharpBinaryOperation>
>(
  "csharp.expected-type.binary-operation",
  csharpBinarySelectionsEqual,
);

export function analyzeCsharpExpectedTypes(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  objectShapes: CsharpObjectShapeClassifications,
  callables: CsharpCallableContractIndex,
  valueReadStages: CsharpValueReadStageIndex,
  declarations: Pick<CsharpDeclarationClassifications, "returnContract">,
): CsharpExpectedTypeClassifications {
  const input: CsharpExpectedTypeAnalysisInput = { policy, evidence, operations, objectShapes, callables, valueReadStages, declarations };
  const expectedBinaryUses: { readonly expression: Node; readonly targetType: TargetTypeRef }[] = [];
  const binaryUses = createTargetUseClassificationBuilder();
  const collection = createCsharpExpectedUseCollection(policy);
  const returnTargets = createCsharpExpectedReturnTargets(input, collection);
  const constructUses = createCsharpExpectedConstructUses(input, collection);
  const propagation = createCsharpExpectedTypePropagation(input, collection, classifyExpectedBinary);

  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile, sourceFile);
  }
  let callableStateChanged = true;
  for (let pending = collection.takePending(); pending !== undefined || callableStateChanged; pending = collection.takePending()) {
    for (; pending !== undefined; pending = collection.takePending()) {
      propagation.propagate(pending);
    }
    callableStateChanged = returnTargets.refreshCallableTargets();
    if (callableStateChanged) {
      for (const sourceFile of policy.sourceFiles) {
        visit(sourceFile, sourceFile);
      }
    }
  }
  returnTargets.recordReturnDemands();
  const binaryFacts = binaryUses.seal();
  const expectedBinaries = new WeakMap<Node, Map<string, NonNullable<ReturnType<typeof selectCsharpBinaryOperation>>>>();
  for (const { expression, targetType } of expectedBinaryUses) {
    const selection = binaryFacts.get(expectedBinaryUse(expression, targetType), expectedBinaryKey);
    if (selection === undefined) continue;
    let byTarget = expectedBinaries.get(expression);
    if (byTarget === undefined) {
      byTarget = new Map();
      expectedBinaries.set(expression, byTarget);
    }
    byTarget.set(targetTypeRefKey(targetType), selection);
  }
  const expectedBinary = (expression: Node, targetType: TargetTypeRef) =>
    expectedBinaries.get(expression)?.get(targetTypeRefKey(targetType));
  const projection = collection.seal();
  const returns = returnTargets.seal();
  const constructions = propagation.seal();
  const admission = admitCsharpExpectedNativeUses({
    ast: policy.ast,
    sites: projection.sites,
    sitesOf: projection.sitesOf,
    expectedBinary,
    intrinsicTarget: constructions.intrinsicTarget,
    callableTarget: returns.callableTarget,
    absentValue,
  });

  const classifications: CsharpExpectedTypeClassifications = {
    expectedUse: admission.expectedUse,
    issues: Object.freeze([...collection.issues]),
    targetTypes: projection.targetTypes,
    expectedType: Object.freeze({ get: projection.expectedType }),
    requiredExpectedType: Object.freeze({ get: projection.requiredExpectedType }),
    returnContext: Object.freeze({ get: returns.returnContext }),
    exactIntegerConversion: Object.freeze({ get: projection.exactIntegerConversion }),
    storageExpectedType: Object.freeze({ get: projection.storageExpectedType }),
    callableTarget: Object.freeze({ get: returns.callableTarget }),
    arrayLiteralCarrier: Object.freeze({ get: constructions.arrayLiteralCarrier }),
    expectedBinary: Object.freeze({ get: expectedBinary }),
  };
  return Object.freeze(classifications);

  function visit(node: Node, sourceFile: SourceFile): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    if (operations.nativeUnreachable.get(node)) return;
    returnTargets.recordAccessorReturnContext(node);
    constructUses.recordInitializer(node);
    returnTargets.recordReturnExpression(node);
    returnTargets.recordExpressionBodyReturn(node);
    constructUses.recordThrownValue(node);
    const contextualType = evidence.contextualType.get(node);
    collection.record(
      node,
      contextualType === undefined
        ? undefined
        : evidence.semanticTargetType.get(contextualType, sourceFile),
      "contextual",
      undefined,
    );
    propagation.recordIntrinsicArrayLiteralElements(node);
    propagation.recordIntrinsicObjectLiteralMembers(node);
    if (!constructUses.recordOperationUses(node, sourceFile)) return;
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child, sourceFile);
      }
    });
  }

  function absentValue(expression: Node): boolean {
    return policy.ast.kindName(expression) === "KindNullKeyword" ||
      policy.ast.is.IsIdentifier(expression) && Node_Text(policy.ast, expression) === "undefined" &&
        policy.navigation.referenceFor(expression) === undefined;
  }

  function classifyExpectedBinary(expression: Node, targetType: TargetTypeRef): CsharpExpectedBinarySelection {
    const expectedSelection = selectCsharpBinaryOperation(
      policy,
      expression,
      evidence.nodeTargetType.get,
      targetType,
    );
    if (expectedSelection !== undefined) {
      const result = binaryUses.set(
        expectedBinaryUse(expression, targetType),
        expectedBinaryKey,
        expectedSelection,
      );
      if (result.kind === "conflict") {
        throw new Error(
          `Conflicting target-use classification '${expectedBinaryKey.id}'.`,
        );
      }
      if (result.kind === "added") expectedBinaryUses.push({ expression, targetType });
    }
    return expectedSelection;
  }

  function expectedBinaryUse(
    expression: Node,
    targetType: TargetTypeRef,
  ) {
    return targetUseSiteRef(
      expression,
      "binary-expected-result",
      csharpTargetRepresentationContractId,
      targetTypeRefKey(targetType),
    );
  }
}
