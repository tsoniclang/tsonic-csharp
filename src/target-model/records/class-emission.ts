import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpCaptureFrame } from "./capture-storage.js";

export interface CsharpNativeClassEmission {
  readonly forwardingConstructors: readonly CsharpForwardingConstructorEmission[];
  readonly name: string;
  readonly abstract: boolean;
  readonly staticCompanion: boolean;
  readonly instanceMembers: readonly Node[];
  readonly staticMembers: readonly Node[];
  readonly authoredConstructor: Node | undefined;
  readonly factoryConstructor: "authored" | "implicit" | "default";
}

export interface CsharpForwardingConstructorEmission {
  readonly subject: Node;
  readonly parameters: readonly {
    readonly name: string;
    readonly carrier: TargetTypeRef;
    readonly passing: "in" | "out" | "ref" | undefined;
    readonly paramsArray: boolean;
  }[];
}

export type CsharpClassCaptureEmission =
  | { readonly kind: "frame"; readonly name: string; readonly carrier: TargetTypeRef; readonly frame: CsharpCaptureFrame }
  | { readonly kind: "binding" | "expression"; readonly name: string; readonly carrier: TargetTypeRef; readonly declaration: Node; readonly reference: Node };

export interface CsharpClassEmissionRecords {
  readonly nativeClass: { readonly get: (subject: Node) => CsharpNativeClassEmission | undefined };
  readonly classCaptures: { readonly get: (subject: Node) => readonly CsharpClassCaptureEmission[] | undefined };
}
