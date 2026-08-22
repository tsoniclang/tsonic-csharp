import type { ExtensionFactSubject, Node } from "@tsonic/tsts";
import type {
  CsharpJsValueOperationSelection,
} from "../../policy/js-value-operations/index.js";
import type {
  CsharpConversionSelection,
} from "../../policy/conversions/index.js";
import type {
  CsharpProviderValueSelection,
} from "../../policy/members/index.js";
import type {
  CsharpJsArrayMutationSelection,
  CsharpRegularExpressionLiteralSelection,
} from "../../policy/operations/index.js";
import type {
  CsharpTargetCallSelection,
  CsharpTargetElementSelection,
  CsharpTargetPropertySelection,
  ResolvedSourceCallInfo,
} from "../../policy/members/index.js";
import type {
  resolveCsharpJsValueObjectShapeProperty,
} from "../../policy/members/index.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberLookupResult,
  CsharpProjectConstructibleTypeProjection,
  CsharpTypeofRuntimeKind,
  resolveCsharpRuntimeUnionObjectShapeProperty,
  TargetTypeRef,
} from "../../policy/types/index.js";

export interface CsharpMethodTypeArgumentProjectionClassification {
  readonly targetTypeParameterIndex: number;
  readonly projection: CsharpProjectConstructibleTypeProjection;
}
import type {
  CsharpNativePointerOperationSelection,
  CsharpOperationSelection,
  CsharpResolvedBinaryOperation,
  CsharpResolvedIteration,
  CsharpResolvedResourceManagement,
  CsharpResolvedUnaryOperation,
  CsharpResolvedDestructuringAssignmentOperation,
  CsharpSourceFlowCallSelection,
  CsharpTypeofComparisonSelection,
  CsharpTypedLocationOperationSelection,
} from "../../policy/operations/index.js";

export interface CsharpSourceCallArgumentClassification {
  readonly sourceParameterTypes?: readonly (TargetTypeRef | undefined)[];
  readonly sourceArgumentParameterTypes?: readonly (TargetTypeRef | undefined)[];
}

export interface CsharpCallClassification
  extends CsharpSourceCallArgumentClassification {
  readonly source?: ResolvedSourceCallInfo;
  readonly sourceFlow: CsharpSourceFlowCallSelection;
  readonly jsValue: CsharpJsValueOperationSelection;
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
  readonly jsValue: CsharpJsValueOperationSelection;
  readonly target?: CsharpTargetElementSelection;
  readonly receiverType?: TargetTypeRef;
  readonly selectedResultType?: TargetTypeRef;
  readonly flowReadConversion?: CsharpConversionSelection;
}

export interface CsharpSourceOwnedPropertyClassification {
  readonly jsValueOperation: CsharpJsValueOperationSelection;
  readonly objectShape?: CsharpObjectShapeFact;
  readonly selectedSubjects: readonly ExtensionFactSubject[];
  readonly selectedReceiverType?: TargetTypeRef;
  readonly runtimeUnionProperty: ReturnType<
    typeof resolveCsharpRuntimeUnionObjectShapeProperty
  >;
  readonly jsValueProperty: ReturnType<
    typeof resolveCsharpJsValueObjectShapeProperty
  >;
  readonly shapeMember?: CsharpObjectShapeMemberLookupResult;
  readonly rawReadType?: TargetTypeRef;
  readonly selectedReadType?: TargetTypeRef;
  readonly jsValuePropertyWrite: CsharpJsValueOperationSelection;
}

export interface CsharpPropertyClassification {
  readonly selection: CsharpTargetPropertySelection;
  readonly sourceOwned?: CsharpSourceOwnedPropertyClassification;
}

export interface CsharpBinaryClassification {
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

export interface CsharpTargetOperationClassifications {
  resultType(node: Node): TargetTypeRef | undefined;
  call(node: Node): CsharpCallClassification | undefined;
  construction(node: Node): CsharpConstructionClassification | undefined;
  property(node: Node): CsharpPropertyClassification | undefined;
  element(node: Node): CsharpElementClassification | undefined;
  binary(node: Node): CsharpBinaryClassification | undefined;
  unary(node: Node): CsharpUnaryClassification | undefined;
  iteration(node: Node): CsharpOperationSelection<CsharpResolvedIteration> | undefined;
  resource(node: Node): CsharpOperationSelection<CsharpResolvedResourceManagement> | undefined;
  nativePointer(node: Node): CsharpNativePointerOperationSelection | undefined;
  typedLocation(node: Node): CsharpTypedLocationOperationSelection | undefined;
  jsCondition(node: Node): CsharpJsValueOperationSelection | undefined;
  jsTypeof(node: Node): CsharpJsValueOperationSelection | undefined;
  typeofRuntimeKind(node: Node): CsharpTypeofRuntimeKind | undefined;
  jsVoid(node: Node): CsharpJsValueOperationSelection | undefined;
  jsObjectLiteral(node: Node): CsharpJsValueOperationSelection | undefined;
  jsArrayMutation(node: Node): CsharpJsArrayMutationSelection | undefined;
  providerValue(node: Node): CsharpProviderValueSelection | undefined;
  regularExpression(node: Node): CsharpRegularExpressionLiteralSelection | undefined;
  throwable(node: Node): boolean | undefined;
  exactCatchRethrow(node: Node): boolean;
}
