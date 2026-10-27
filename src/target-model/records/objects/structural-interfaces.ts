import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpFinalStructuralInterfaceImplementation } from "./heritage.js";

export interface CsharpStructuralInterfaceEmission extends Omit<CsharpFinalStructuralInterfaceImplementation, "methods"> {
  readonly methods: readonly (CsharpFinalStructuralInterfaceImplementation["methods"][number] & {
    readonly typeParameterNames: readonly { readonly identity: string; readonly name: string }[];
    readonly invocations: readonly { readonly name: string; readonly sourceName: string }[];
  })[];
}

export interface CsharpStructuralInterfaceRecords {
  readonly structuralInterface: {
    readonly get: (carrier: TargetTypeRef) => readonly CsharpStructuralInterfaceEmission[] | undefined;
  };
}
