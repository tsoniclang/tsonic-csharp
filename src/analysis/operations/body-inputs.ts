import type { Node, SourceFile } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpOperationIssue, CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpTypedLocationOperationSelection } from "../../target-model/records/storage/typed-locations.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../target-model/types/model.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { ResolvedSourceCallInfo } from "../../target-model/records/calls/source-calls.js";
import type { CsharpOperationProducer } from "../program/records/operations/operations.js";
import type { CsharpTypeProjectionOperations } from "../declarations/type-projection-inputs.js";
import type { CsharpTypeResolutionServices } from "../source-evidence/types/resolution/engine.js";
import type { CsharpCallDeclarationArgumentsSource, CsharpCompletedCallDeclarationArguments } from "../source-evidence/types/resolution/call-declaration-arguments.js";
import type { CsharpSourceCallContractSource } from "../source-evidence/types/resolution/call-contracts.js";
import { analyzeCsharpCallOperation } from "./call-operation.js";
import { selectCsharpTypedLocationOperation } from "./typed-locations.js";

export interface CsharpBodyCallInput {
  readonly node: Node;
  readonly sourceFile: SourceFile;
  readonly issues: readonly CsharpOperationIssue[];
  readonly binaryExecutionDrivers: readonly CsharpTargetBinaryExecutionDriver[];
}

export interface CsharpBodyCallSource {
  readonly node: Node;
  readonly sourceFile: SourceFile;
  readonly source: ResolvedSourceCallInfo | undefined;
  readonly contract: CsharpSourceCallContractSource | undefined;
  readonly declarationSource: CsharpCallDeclarationArgumentsSource | undefined;
}

export interface CsharpBodyCallArguments extends CsharpBodyCallSource {
  readonly sourceTypeArguments: readonly TargetTypeRef[] | undefined;
}

export interface CsharpBodyDeclaredCallArguments extends CsharpBodyCallArguments {
  readonly declared: CsharpCompletedCallDeclarationArguments | undefined;
}

export interface CsharpBodyOperationProducer {
  readonly selectedCall: CsharpTypeProjectionOperations["selectedCall"];
  readonly declaredCall: CsharpTypeProjectionOperations["selectedCall"];
  readonly typedLocation: CsharpTargetOperationClassifications["typedLocation"];
  captureCall(node: Node, sourceFile: SourceFile): CsharpBodyCallSource;
  completeLocation(node: Node, sourceFile: SourceFile): CsharpTypedLocationOperationSelection | undefined;
  completeDeclarationArguments(node: Node, sourceFile: SourceFile): CsharpBodyDeclaredCallArguments;
  completeCallArguments(node: Node, sourceFile: SourceFile): CsharpBodyCallArguments;
  completeCall(node: Node, sourceFile: SourceFile): CsharpBodyCallInput;
}

export function createCsharpBodyOperationInputs(
  policy: CsharpPolicyContext,
  producer: CsharpOperationProducer,
  queries: Pick<CsharpTypeResolutionServices, "nodeQuerySource" | "completeCallDeclarationArguments" |
    "completeBodyCallArguments" | "completeSourceCallTypeArguments">,
): CsharpBodyOperationProducer {
  const locations = new WeakMap<Node, { readonly sourceFile: SourceFile; readonly value: CsharpTypedLocationOperationSelection }>();
  const calls = new WeakMap<Node, CsharpBodyCallInput>();
  const argumentsByCall = new WeakMap<Node, CsharpBodyCallArguments>();
  const declaredByCall = new WeakMap<Node, CsharpBodyDeclaredCallArguments>();
  const sourcesByCall = new WeakMap<Node, CsharpBodyCallSource>();
  const completeLocation = (node: Node, sourceFile: SourceFile): CsharpTypedLocationOperationSelection | undefined => {
    const ast = policy.ast;
    if (!ast.is.IsCallExpression(node) && !ast.is.IsNewExpression(node) &&
      !ast.is.IsPropertyAccessExpression(node) && !ast.is.IsElementAccessExpression(node) &&
      !ast.is.IsBinaryExpression(node) && !ast.is.IsPrefixUnaryExpression(node) &&
      !ast.is.IsPostfixUnaryExpression(node)) return undefined;
    const existing = locations.get(node);
    if (existing !== undefined) {
      if (existing.sourceFile !== sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
        "A body location requires its original source file.", node);
      return existing.value;
    }
    const value = selectCsharpTypedLocationOperation(policy, node, sourceFile);
    producer.typedLocation.selected(node, value);
    locations.set(node, Object.freeze({ sourceFile, value }));
    return value;
  };
  const captureCall = (node: Node, sourceFile: SourceFile): CsharpBodyCallSource => {
    if (!policy.ast.is.IsCallExpression(node)) return failTargetAnalysisInvariant("tsonic-csharp",
      "A call argument contribution requires its original call occurrence.", node);
    const previous = sourcesByCall.get(node);
    if (previous !== undefined) {
      if (previous.sourceFile !== sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
        "A captured call keeps its original source file.", node);
      return previous;
    }
    const query = queries.nodeQuerySource(node, sourceFile);
    const expression = query.root.kind === "node" ? query.root.selectedExpression : undefined;
    if (expression?.kind !== "call" || expression.isNew || expression.node !== node || expression.queries.sourceFile !== sourceFile) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A body call requires its original selected-expression capture.", node);
    }
    const source = expression.selection.kind === "missing" ? undefined : expression.selection.source;
    const contract = expression.contract;
    const declarationSource = contract?.declarationArguments;
    if (source === undefined ? declarationSource !== undefined : declarationSource === undefined || declarationSource.source !== source) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A body call requires its retained declared argument source.", node);
    }
    const input = Object.freeze({ node, sourceFile, source, contract, declarationSource });
    sourcesByCall.set(node, input);
    return input;
  };
  const completeDeclarationArguments = (node: Node, sourceFile: SourceFile): CsharpBodyDeclaredCallArguments => {
    const previous = declaredByCall.get(node);
    if (previous !== undefined) {
      if (previous.sourceFile !== sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
        "A body call keeps its original argument source file.", node);
      return previous;
    }
    const captured = captureCall(node, sourceFile);
    const declared = captured.declarationSource === undefined ? undefined
      : queries.completeCallDeclarationArguments(captured.declarationSource, Object.freeze({ depth: 0 }));
    const input = Object.freeze({ ...captured, declared, sourceTypeArguments: declared?.arguments });
    declaredByCall.set(node, input);
    return input;
  };
  const completeCallArguments = (node: Node, sourceFile: SourceFile): CsharpBodyCallArguments => {
    const previous = argumentsByCall.get(node);
    if (previous !== undefined) {
      if (previous.sourceFile !== sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
        "A body call keeps its original argument source file.", node);
      return previous;
    }
    const declared = completeDeclarationArguments(node, sourceFile);
    const sourceTypeArguments = declared.declared === undefined ? undefined : queries.completeBodyCallArguments(declared.declared);
    const input = Object.freeze({ ...declared, sourceTypeArguments });
    argumentsByCall.set(node, input);
    return input;
  };
  return Object.freeze({ selectedCall: Object.freeze({ get: (node: Node) => argumentsByCall.get(node) }),
    declaredCall: Object.freeze({ get: (node: Node) => declaredByCall.get(node) }),
    typedLocation: Object.freeze({ get: producer.typedLocation.get }), completeLocation,
    captureCall, completeDeclarationArguments, completeCallArguments,
    completeCall(node: Node, sourceFile: SourceFile): CsharpBodyCallInput {
      if (!policy.ast.is.IsCallExpression(node)) return failTargetAnalysisInvariant("tsonic-csharp",
        "A callable body input requires the original call occurrence.", node);
      const existing = calls.get(node);
      if (existing !== undefined) {
        if (existing.sourceFile !== sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
          "A body call requires its original source file.", node);
        return existing;
      }
      const issues: CsharpOperationIssue[] = [];
      const binaryExecutionDrivers: CsharpTargetBinaryExecutionDriver[] = [];
      const body = completeCallArguments(node, sourceFile);
      analyzeCsharpCallOperation(node, sourceFile, policy, producer, completeLocation(node, sourceFile),
        binaryExecutionDrivers, issues, body, queries);
      const result = Object.freeze({ node, sourceFile, issues: Object.freeze(issues),
        binaryExecutionDrivers: Object.freeze(binaryExecutionDrivers) });
      calls.set(node, result);
      return result;
    },
  });
}
