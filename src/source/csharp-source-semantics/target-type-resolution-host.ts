import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetBindingFact,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";

export interface CsharpSemanticTypeDeclarationShape {
  readonly kind: "class" | "interface" | "enum";
  readonly name: string;
  readonly targetType: TargetTypeRef;
}

export interface CsharpTargetTypeResolutionHost {
  readonly getCsharpTargetBindingByTargetId: (targetId: string) => TargetBindingFact | undefined;
  readonly getCsharpTargetBindingByMetadataName: (metadataName: string) => TargetBindingFact | undefined;
  readonly getBaseTargetTypeRef?: (type: TargetTypeRef) => TargetTypeRef | undefined;
  readonly getAssignableTargetTypeRefs?: (type: TargetTypeRef) => readonly TargetTypeRef[];
  readonly getCatchVariableTargetTypeRef?: () => TargetTypeRef | undefined;
  readonly getCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
  readonly getSemanticTypeDeclarationShape: (
    type: Type,
    context: ExtensionObservationContext,
  ) => CsharpSemanticTypeDeclarationShape | undefined;
}
