import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";

export interface CsharpObjectShapeLifecycleHost {
  readonly getCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
  readonly getRecordedCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
}
