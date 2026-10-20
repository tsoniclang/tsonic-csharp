import type { Node } from "@tsonic/tsts";
import type { CsharpJsonObjectShapeContract } from "./json-object-shapes.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeCapability, CsharpObjectShapeProjection } from "../types/model.js";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpConversionSelection } from "../conversions/selection.js";
import type { CsharpObjectProjectionEmission } from "./closed-object-shapes.js";

export interface CsharpObjectShapeProjectionDeclaration {
  readonly emission: CsharpObjectProjectionEmission;
  readonly receiver: CsharpObjectShapeFact;
  readonly selection: CsharpObjectShapeProjection;
  readonly methodName: string;
  readonly receiverRequiresNullCheck: boolean;
  readonly typeParameters: readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[];
  readonly typeParameterNames: readonly { readonly identity: string; readonly name: string }[];
  readonly conversions: readonly {
    readonly source: TargetTypeRef;
    readonly target: TargetTypeRef;
    readonly selection: CsharpConversionSelection;
  }[];
}

export interface CsharpObjectShapeArtifact {
  readonly jsonContract: CsharpJsonObjectShapeContract | undefined;
  readonly key: string;
  readonly fact: CsharpObjectShapeFact;
  readonly materialization: "source" | "synthetic";
  readonly capabilities: readonly CsharpObjectShapeCapability[];
  readonly projections: readonly CsharpObjectShapeProjectionDeclaration[];
  readonly typeParameterNames: readonly { readonly identity: string; readonly name: string }[];
  readonly receiverBoundMethodKeys: readonly string[];
  readonly dependencies: readonly string[];
  readonly dependents: readonly string[];
}

export interface CsharpObjectShapeDemand {
  readonly artifacts: readonly CsharpObjectShapeArtifact[];
  readonly targetShapes: Readonly<Record<string, CsharpObjectShapeFact>>;
  readonly get: (key: string) => CsharpObjectShapeArtifact | undefined;
  readonly projection: (subject: Node) => CsharpObjectShapeProjectionDeclaration | undefined;
}

export interface CsharpObjectShapeDeclarationNaming {
  readonly parameters: readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[];
  readonly reservedParameters: readonly { readonly identity: string; readonly name: string }[];
  readonly reservedNames: readonly string[];
}

export type CsharpPreparedObjectShapeProjection = Omit<CsharpObjectShapeProjectionDeclaration, "typeParameterNames">;

export interface CsharpObjectShapeArtifactClosure extends Omit<CsharpObjectShapeArtifact, "typeParameterNames" | "projections"> {
  readonly naming: CsharpObjectShapeDeclarationNaming;
  readonly projections: readonly CsharpPreparedObjectShapeProjection[];
}

export interface CsharpObjectShapeDemandClosure {
  readonly artifacts: readonly CsharpObjectShapeArtifactClosure[];
  readonly targetShapes: Readonly<Record<string, CsharpObjectShapeFact>>;
  readonly projectionSubjects: readonly {
    readonly subject: Node;
    readonly projection: CsharpPreparedObjectShapeProjection;
  }[];
}

export interface CsharpObjectShapeProjectionAdmission {
  readonly emission: CsharpObjectShapeProjectionDeclaration["emission"];
  readonly selection: CsharpObjectShapeProjection;
  readonly conversions: CsharpObjectShapeProjectionDeclaration["conversions"];
}

export interface CsharpObjectShapeDemandPublication {
  readonly artifacts: readonly CsharpObjectShapeArtifact[];
  readonly targetShapes: Readonly<Record<string, CsharpObjectShapeFact>>;
  readonly projectionSubjects: readonly {
    readonly subject: Node;
    readonly projection: CsharpObjectShapeProjectionDeclaration;
  }[];
}
