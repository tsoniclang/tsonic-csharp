import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { SourceCallableSourceContract } from "./source-callable-contract.js";

export interface CsharpCallableDeclarationEmission {
  readonly contract: SourceCallableSourceContract;
  readonly async: boolean;
  readonly returnCarrier: TargetTypeRef;
  readonly generator: boolean;
}

export interface CsharpCallableDeclarationRecords {
  readonly callableDeclaration: { readonly get: (subject: Node) => CsharpCallableDeclarationEmission | undefined };
}
