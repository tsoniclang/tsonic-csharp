import type { Node } from "@tsonic/tsts";

export interface CsharpLambdaBodyEmission {
  readonly completion: "void" | "absence" | undefined;
  readonly preparation: "expression" | "statements";
}

export interface CsharpLambdaEmissionRecords {
  readonly lambdaBody: { readonly get: (node: Node) => CsharpLambdaBodyEmission | undefined };
}
