import type { Node } from "@tsonic/tsts";

export interface CsharpLambdaBodyEmission {
  readonly completion: "void" | "absence" | undefined;
}

export interface CsharpLambdaEmissionRecords {
  readonly lambdaBody: { readonly get: (node: Node) => CsharpLambdaBodyEmission | undefined };
}
