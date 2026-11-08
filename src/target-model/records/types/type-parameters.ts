import type { Node } from "@tsonic/tsts";
import type { CsharpTypeParameterConstraint } from "../../types/native-type-data.js";

export interface CsharpTypeParameterEmission {
  readonly identity: string;
  readonly name: Node;
  readonly constraints: readonly CsharpTypeParameterConstraint[];
}

export interface CsharpTypeParameterEmissionRecords {
  readonly typeParameterEmission: { readonly get: (node: Node) => CsharpTypeParameterEmission | undefined };
}
