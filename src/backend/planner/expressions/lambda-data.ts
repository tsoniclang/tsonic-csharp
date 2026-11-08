import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpTypeNode } from "../../target-ast/syntax/index.js";

export interface LambdaTargetContext {
  readonly carrier: TargetTypeRef;
  readonly type: CsharpTypeNode;
  readonly signature: {
    readonly parameters: readonly CsharpTypeNode[];
    readonly parameterTargetTypes: readonly TargetTypeRef[];
    readonly returnType?: CsharpTypeNode;
    readonly returnTargetType?: TargetTypeRef;
    readonly restParameterIndex?: number;
  };
}

export interface LambdaReturnContext {
  readonly returnExpressionType: CsharpTypeNode;
  readonly returnExpressionTypeSubject?: Node;
  readonly returnExpressionTargetType?: TargetTypeRef;
}
