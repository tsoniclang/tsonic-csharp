import type { Node } from "@tsonic/tsts";
import type { CsharpClassCaptureEmission, CsharpClassEmissionRecords, CsharpNativeClassEmission } from "../../../target-model/records/class-emission.js";

export function createCsharpClassEmissionRecords(
  classes: ReadonlyMap<Node, CsharpNativeClassEmission>,
  captures: ReadonlyMap<Node, readonly CsharpClassCaptureEmission[]>,
): CsharpClassEmissionRecords {
  return Object.freeze({ nativeClass: Object.freeze({ get: (subject: Node) => classes.get(subject) }),
    classCaptures: Object.freeze({ get: (subject: Node) => captures.get(subject) }) });
}
