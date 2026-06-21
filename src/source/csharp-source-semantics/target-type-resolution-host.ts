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
  readonly getCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
  readonly getSemanticTypeDeclarationShape: (
    type: Type,
    context: ExtensionObservationContext,
  ) => CsharpSemanticTypeDeclarationShape | undefined;
}
