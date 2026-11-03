import type { ExtensionFactSubject, Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpSourceMemberKey } from "../../types/model.js";
import type { CsharpCallableDeclarationEvidence, CsharpCallableSignatureSource } from "../types/callable-source.js";

export interface CsharpObjectMemberDeclarationSource {
  readonly property: TypePropertyInfo;
  readonly propertyType: Type;
  readonly queries: SourceFileSemantics;
  readonly declarations: readonly Node[];
  readonly subjects: readonly ExtensionFactSubject[];
  readonly authoredTypeNodes: readonly Node[];
  readonly sourceKey: CsharpSourceMemberKey;
  readonly targetName: string;
  readonly method: boolean;
  readonly getters: readonly Node[];
  readonly setters: readonly Node[];
  readonly methodDeclaration: Node | undefined;
  readonly callableDeclaration: CsharpCallableDeclarationEvidence;
  readonly callableSignature: CsharpCallableSignatureSource | undefined;
}
