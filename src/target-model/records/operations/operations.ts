import type { CsharpConversionSelection } from "../../conversions/selection.js";
import type { CsharpJsValueOperationSelection } from "../../operations/js-values.js";
import type { CsharpObjectShapeFact, CsharpTypeofRuntimeKind, TargetTypeRef } from "../../types/model.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../metadata/provider-metadata.js";
import type { CsharpObjectShapeMemberLookupResult } from "../../types/object-shape-members.js";
import type { CsharpTypeofResult } from "../../types/runtime-kind.js";
import type { CsharpBorrowedSequenceInput } from "../storage/borrowed-sequences.js";
import type { CsharpElementDeletionSelection } from "../storage/element-deletion.js";
import type { CsharpNativeHandler } from "../native/native-handlers.js";
import type { CsharpJsArrayMutationSelection } from "../storage/js-array-mutations.js";
import type { CsharpResolvedResourceManagement } from "../storage/management.js";
import type { CsharpTargetCallSelection, CsharpTargetElementSelection, CsharpTargetPropertySelection } from "./member-selections.js";
import type { ResolvedSourceCallInfo } from "../calls/source-calls.js";
import type { CsharpNativePointerOperationSelection } from "../native/native-pointers.js";
import type { CsharpProjectConstructibleTypeProjection } from "../objects/object-shapes.js";
import type { CsharpOperationSelection, CsharpResolvedBinaryOperation, CsharpResolvedDestructuringAssignmentOperation, CsharpResolvedUnaryOperation } from "./operator-selection.js";
import type { CsharpRegularExpressionLiteralSelection } from "./regexp-literal.js";
import type { CsharpRuntimeUnionObjectShapePropertyResolution } from "../objects/runtime-union-object-shapes.js";
import type { CsharpResolvedIteration } from "./selection.js";
import type { CsharpSourceFlowCallSelection } from "./source-flow.js";
import type { CsharpSwitchSelection } from "./switch.js";
import type { CsharpNativeRefReturnSelection, CsharpTypedLocationOperationSelection } from "../storage/typed-locations.js";
import type { CsharpTypeofComparisonSelection } from "./typeof.js";
import type { CsharpProviderValueSelection } from "./value-selection.js";
import type { ExtensionFactSubject, Node } from "@tsonic/tsts";

export interface CsharpMethodTypeArgumentProjectionClassification {
  readonly targetTypeParameterIndex: number;
  readonly projection: CsharpProjectConstructibleTypeProjection;
}

export interface CsharpSourceCallArgumentClassification {
  readonly sourceCall?: import("../../operations/source-callees.js").CsharpSourceCalleeSelection;
  readonly sourceMethodValue?: NonNullable<import("../../types/model.js").CsharpTargetNamedTypeRef["csharpMethodValue"]>;
  readonly sourceParameterTypes?: readonly (TargetTypeRef | undefined)[];
  readonly sourceArgumentParameterTypes?: readonly (TargetTypeRef | undefined)[];
  readonly sourceArgumentGrouping?: CsharpSourceArgumentGrouping;
}

export interface CsharpSourceArgumentGroupingEntry {
  readonly binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number];
  readonly expression: Node;
  readonly sourceArgumentIndex: number;
  readonly effectiveArgumentIndex: number;
  readonly sourceParameterIndex: number;
  readonly parameterIndex: number;
  readonly sourceForm: ResolvedSourceCallInfo["sourceArgumentBindings"][number]["sourceForm"];
  readonly type: TargetTypeRef;
  readonly parameter: import("../../types/model.js").CsharpTargetParameter;
}

export interface CsharpSourceArgumentGroup {
  readonly parameterIndex: number;
  readonly type: TargetTypeRef;
  readonly collect: boolean;
  readonly arguments: readonly { readonly index: number; readonly spread: boolean }[];
}

export type CsharpSourceArgumentGrouping =
  | { readonly kind: "grouped"; readonly arguments: readonly CsharpSourceArgumentGroupingEntry[];
      readonly groups: readonly CsharpSourceArgumentGroup[] }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "unresolved"; readonly reason: string }
  | { readonly kind: "inconsistent"; readonly reason: string };

export type CsharpCallForm = { readonly optionalReceiverRouting: "call" | "chain" } & (
  | { readonly kind: "type-test"; readonly typeTest: import("../../operations/type-tests.js").CsharpClosedTypeTest }
  | { readonly kind: "keep-alive"; readonly sourceFlow: Extract<CsharpSourceFlowCallSelection, { readonly kind: "keep-alive" }> }
  | { readonly kind: "source-flow-rejected"; readonly sourceFlow: Extract<CsharpSourceFlowCallSelection, { readonly kind: "rejected" }> }
  | { readonly kind: "js-value"; readonly operation: Exclude<CsharpJsValueOperationSelection, { readonly kind: "not-js-value" }> }
  | { readonly kind: "target" }
);

export interface CsharpCallClassification
  extends CsharpSourceCallArgumentClassification {
  readonly form: CsharpCallForm;
  readonly sourceResult?: import("../../operations/source-call-results.js").CsharpSourceCallResult;
  readonly optionalCallee?: {
    readonly expression: Node;
    readonly storage: TargetTypeRef;
    readonly type: TargetTypeRef;
    readonly guard: true;
  };
  readonly optionalReceiver?: {
    readonly expression: Node;
    readonly storage: TargetTypeRef;
    readonly type: TargetTypeRef;
    readonly guard: boolean;
    readonly parameterType?: TargetTypeRef;
    readonly conversion?: CsharpConversionSelection;
  };
  readonly unionCall: import("../calls/union-calls.js").CsharpUnionCallClassification;
  readonly source?: ResolvedSourceCallInfo;
  readonly target?: CsharpTargetCallSelection;
  readonly selectedResultType?: TargetTypeRef;
  readonly sourceTypeArguments?: readonly TargetTypeRef[];
  readonly methodTypeArgumentProjections?: readonly CsharpMethodTypeArgumentProjectionClassification[];
}

export interface CsharpConstructionClassification
  extends CsharpSourceCallArgumentClassification {
  readonly jsValue: CsharpJsValueOperationSelection;
  readonly target?: CsharpTargetCallSelection;
  readonly selectedResultType?: TargetTypeRef;
  readonly methodTypeArgumentProjections?: readonly CsharpMethodTypeArgumentProjectionClassification[];
}

export interface CsharpElementClassification {
  readonly sourceOwned?: CsharpSourceOwnedMemberClassification;
  readonly receiverProjection?: CsharpMemberReceiverProjection;
  readonly jsValue: CsharpJsValueOperationSelection;
  readonly target?: CsharpTargetElementSelection;
  readonly receiverType?: TargetTypeRef;
  readonly selectedResultType?: TargetTypeRef;
  readonly flowReadConversion?: CsharpConversionSelection;
}

export interface CsharpSourceOwnedMemberClassification {
  readonly projectedWrite?: import("../storage/typed-location-storage.js").CsharpTypedLocationStorageSelection;
  readonly jsValueOperation: CsharpJsValueOperationSelection;
  readonly objectShape?: CsharpObjectShapeFact;
  readonly selectedSubjects: readonly ExtensionFactSubject[];
  readonly selectedReceiverType?: TargetTypeRef;
  readonly runtimeUnionProperty: CsharpRuntimeUnionObjectShapePropertyResolution;
  readonly shapeMember?: CsharpObjectShapeMemberLookupResult;
  readonly rawReadType?: TargetTypeRef;
  readonly selectedReadType?: TargetTypeRef;
}

export interface CsharpPropertyClassification {
  readonly receiverProjection?: CsharpMemberReceiverProjection;
  readonly selection: CsharpTargetPropertySelection;
  readonly sourceOwned?: CsharpSourceOwnedMemberClassification;
}

export interface CsharpMemberReceiverProjection {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
}

export interface CsharpBinaryClassification {
  readonly instanceTest?: import("../../operations/type-tests.js").CsharpClosedTypeTest;
  readonly instanceFactory?: TargetTypeRef;
  readonly jsValue: CsharpJsValueOperationSelection;
  readonly target: CsharpOperationSelection<CsharpResolvedBinaryOperation>;
  readonly destructuring: CsharpOperationSelection<
    CsharpResolvedDestructuringAssignmentOperation
  >;
  readonly propertyWrite?: CsharpJsValueOperationSelection;
  readonly elementWrite?: CsharpJsValueOperationSelection;
  readonly typeofComparison?: {
    readonly operand: Node;
    readonly runtimeKind: CsharpTypeofRuntimeKind;
    readonly selection: CsharpTypeofComparisonSelection;
  };
}

export interface CsharpUnaryClassification {
  readonly jsValue: CsharpJsValueOperationSelection;
  readonly target: CsharpOperationSelection<CsharpResolvedUnaryOperation>;
}

export interface CsharpOperationIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

export type CsharpOperatorForm =
  | "destructuring-assignment"
  | "js-array-mutation"
  | "type-test"
  | "js-value-operation"
  | "typeof-comparison"
  | "js-value-write"
  | "selected";

export interface CsharpOperatorFormClassification {
  readonly form: CsharpOperatorForm;
  readonly usesExpectedResultType?: boolean;
}

export interface CsharpTargetOperationClassifications<
  Iteration extends CsharpOperationSelection<CsharpResolvedIteration> = CsharpOperationSelection<CsharpResolvedIteration>,
> {
  readonly issues: readonly CsharpOperationIssue[];
  readonly awaitCompletion: { readonly get: (node: Node) => import("../../types/await-completions.js").CsharpAwaitCompletion | undefined };
  readonly classPropertyStorage: { readonly get: (declaration: Node) => import("../storage/class-property-storage.js").CsharpClassPropertyStorage | undefined };
  readonly borrowedSequence: { readonly get: (expression: Node) => CsharpBorrowedSequenceInput | undefined };
  readonly nativeGuardResult: { readonly get: (expression: Node) => boolean | undefined };
  readonly nativeUnreachable: { readonly get: (node: Node) => boolean };
  readonly erasedStatement: { readonly get: (statement: Node) => boolean };
  readonly nativeHandler: { readonly get: (expression: Node) => CsharpNativeHandler | undefined };
  readonly operatorForm: {
    readonly get: (expression: Node) => CsharpOperatorForm | undefined;
    readonly usesExpectedResultType: (expression: Node) => boolean | undefined;
  };
  binaryExecutionDriver(): CsharpTargetBinaryExecutionDriver | undefined;
  readonly operationResultType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly selectedCall: { readonly get: (node: Node) => CsharpCallClassification | undefined };
  readonly selectedConstruction: { readonly get: (node: Node) => CsharpConstructionClassification | undefined };
  readonly selectedProperty: { readonly get: (node: Node) => CsharpPropertyClassification | undefined };
  readonly sourceMember: { readonly get: (node: Node) => CsharpSourceOwnedMemberClassification | undefined };
  readonly selectedElement: { readonly get: (node: Node) => CsharpElementClassification | undefined };
  readonly binaryOperation: { readonly get: (node: Node) => CsharpBinaryClassification | undefined };
  readonly switchStatement: { readonly get: (node: Node) => CsharpSwitchSelection | undefined };
  readonly unaryOperation: { readonly get: (node: Node) => CsharpUnaryClassification | undefined };
  readonly iteration: { readonly get: (node: Node) => Iteration | undefined };
  readonly resource: { readonly get: (node: Node) => CsharpOperationSelection<CsharpResolvedResourceManagement> | undefined };
  readonly nativePointer: { readonly get: (node: Node) => CsharpNativePointerOperationSelection | undefined };
  readonly typedLocation: { readonly get: (node: Node) => CsharpTypedLocationOperationSelection | undefined };
  readonly nativeRefReturn: { readonly get: (node: Node) => CsharpNativeRefReturnSelection | undefined };
  readonly jsCondition: { readonly get: (node: Node) => CsharpJsValueOperationSelection | undefined };
  readonly jsTypeof: { readonly get: (node: Node) => CsharpJsValueOperationSelection | undefined };
  readonly typeofRuntimeKind: { readonly get: (node: Node) => CsharpTypeofResult | undefined };
  readonly jsVoid: { readonly get: (node: Node) => CsharpJsValueOperationSelection | undefined };
  readonly jsArrayMutation: { readonly get: (node: Node) => CsharpJsArrayMutationSelection | undefined };
  readonly elementDeletion: { readonly get: (node: Node) => CsharpElementDeletionSelection | undefined };
  readonly providerValue: { readonly get: (node: Node) => CsharpProviderValueSelection | undefined };
  readonly regularExpression: { readonly get: (node: Node) => CsharpRegularExpressionLiteralSelection | undefined };
  readonly throwable: { readonly get: (node: Node) => boolean | undefined };
  readonly throwValue: { readonly get: (node: Node) => { readonly expression: Node; readonly sourceCarrier: TargetTypeRef | undefined;
    readonly targetCarrier: TargetTypeRef | undefined } | undefined };
  readonly exactCatchRethrow: { readonly get: (node: Node) => boolean };
}
