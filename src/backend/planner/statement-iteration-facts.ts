import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetIterationFact,
} from "../../source/csharp-facts.js";
import {
  asTargetTypeRef,
} from "../../source/fact-subjects.js";

export function targetTypeRefFromFactSubject(subject: CsharpTargetIterationFact["elementType"]): TargetTypeRef | undefined {
  return asTargetTypeRef(subject);
}
