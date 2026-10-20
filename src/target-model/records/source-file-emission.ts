import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpClassFactory } from "./class-factories.js";
import type { TargetTypeRef } from "../types/model.js";

export interface CsharpModuleCallableEmission {
  readonly declaration: Node;
  readonly initializer: Node;
  readonly name: string;
  readonly visibility: "public" | "internal";
  readonly carrier: TargetTypeRef;
  readonly parameters: readonly TargetTypeRef[];
  readonly returnCarrier: TargetTypeRef;
  readonly returnMode: "void" | "value";
  readonly async: boolean;
  readonly form: "arrow" | "function";
}

export interface CsharpSourceFileEmissionRecords {
  readonly moduleCallable: { readonly get: (declaration: Node) => CsharpModuleCallableEmission | undefined };
  readonly moduleFactories: { readonly get: (file: SourceFile) => readonly CsharpClassFactory[] | undefined };
}
