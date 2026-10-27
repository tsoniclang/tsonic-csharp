import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpClassFactory } from "../objects/class-factories.js";
import type { TargetTypeRef } from "../../types/model.js";

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
  /** The binding stores the callable in a different carrier than the implementation's own (a contextual adaptation,
   * such as an async body stored as a union-returning handler); the method takes the stored signature and plans the
   * adapted initializer value. */
  readonly adapted: boolean;
}

export interface CsharpSourceFileEmissionRecords {
  readonly moduleCallable: { readonly get: (declaration: Node) => CsharpModuleCallableEmission | undefined };
  readonly moduleFactories: { readonly get: (file: SourceFile) => readonly CsharpClassFactory[] | undefined };
}
