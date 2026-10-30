import type { CsharpClassFactoryType } from "../../types/carriers/class-factories.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/model.js";
import type { CsharpStorageIssue } from "../storage/storage.js";
import type { Node, SourceFile } from "@tsonic/tsts";

export interface CsharpClassCapture {
  readonly declaration: Node;
  readonly reference: Node;
  readonly fieldName: string;
  readonly type: TargetTypeRef;
  readonly mutable: boolean;
}

export interface CsharpClassFactory {
  readonly declaration: Node;
  readonly sourceFile: SourceFile;
  readonly instanceName: string;
  readonly instanceScope: string;
  readonly factoryName: string;
  readonly factoryType: CsharpTargetNamedTypeRef;
  readonly contract: CsharpClassFactoryType;
  readonly captures: readonly CsharpClassCapture[];
  readonly hasInstanceCaptures: boolean;
  readonly environmentName: string;
  readonly identity?: { readonly name: string; readonly type: CsharpTargetNamedTypeRef };
}

export interface CsharpClassFactoryIndex {
  readonly factories: readonly CsharpClassFactory[];
  readonly issues: readonly CsharpStorageIssue[];
  readonly classFactory: { readonly get: (declaration: Node) => CsharpClassFactory | undefined };
}
