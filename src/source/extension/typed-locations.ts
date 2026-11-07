// Typed-location (pointer) operations from Host records (K-2662, I1, I2): marker pointer operations from
// `facts.selections.pointerOperation(call)` and pointer views from the source-core Host record. Every operand keeps its
// marker role and its Host descriptor (`facts.values.type`); the storage and location identities are the record's own.
// No checker Type and no Legacy pointer fact is read here.
import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourcePointerOperationRecord, SourceProgramFacts, SourceTypeDescriptor } from "@tsonic/target-api/source";
import { csharpSourceCoreAnalyses } from "./source-core.js";

interface CsharpSourceTypedLocationOperationBase {
  readonly call: Node;
  readonly pointeeType: SourceTypeDescriptor;
  readonly explicitPointeeTypeNode?: Node;
  readonly resultType: SourceTypeDescriptor;
}

export type CsharpSourceTypedLocationOperation =
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-address";
      readonly storageExpression: Node;
      readonly storageType: SourceTypeDescriptor;
      readonly storageDeclaration?: Node;
      readonly locationIdentity: Node;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-allocate";
      readonly initialExpression: Node;
      readonly initialType: SourceTypeDescriptor;
      readonly locationIdentity: Node;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-load";
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-store";
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
      readonly valueExpression: Node;
      readonly valueType: SourceTypeDescriptor;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-equal";
      readonly leftExpression: Node;
      readonly leftType: SourceTypeDescriptor;
      readonly rightExpression: Node;
      readonly rightType: SourceTypeDescriptor;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-hash";
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-bind";
      readonly identityExpression: Node;
      readonly identityType: SourceTypeDescriptor;
      readonly readExpression: Node;
      readonly readType: SourceTypeDescriptor;
      readonly writeExpression: Node;
      readonly writeType: SourceTypeDescriptor;
      readonly locationIdentity: Node;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-view";
      readonly sourcePointeeType: SourceTypeDescriptor;
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
      readonly readExpression: Node;
      readonly readType: SourceTypeDescriptor;
      readonly writeExpression: Node;
      readonly writeType: SourceTypeDescriptor;
      readonly optional: boolean;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-project";
      readonly sourcePointeeType: SourceTypeDescriptor;
      readonly explicitSourcePointeeTypeNode?: Node;
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
      readonly fromSourceExpression: Node;
      readonly fromSourceType: SourceTypeDescriptor;
      readonly toSourceExpression: Node;
      readonly toSourceType: SourceTypeDescriptor;
    };

/** Operand count of each marker pointer operation (SourcePointerOperationRecord.operands, marker parameter order). */
const markerArity: Readonly<Record<SourcePointerOperationRecord["operation"], number>> = Object.freeze({
  "address-of": 1, allocate: 1, load: 1, store: 2, "equal-pointer": 2, "hash-pointer": 1, "bind-pointer": 3, "project-pointer": 3,
});

export function readCsharpSourceTypedLocationOperation(
  ast: Pick<AstReader, "typeArguments">,
  facts: SourceProgramFacts,
  subject: Node,
): CsharpSourceTypedLocationOperation | undefined {
  const type = (node: Node): SourceTypeDescriptor => {
    const outcome = facts.values.type(node);
    // values.type is total over value nodes (I4) and a Host refusal is forwarded before C# analysis.
    return outcome.kind === "refused" ? failTargetAnalysisInvariant("tsonic-csharp",
      "A typed-location operand reached C# analysis with a refused Host type.", node) : outcome.type;
  };
  const view = csharpSourceCoreAnalyses(facts).pointers.view(subject);
  if (view !== undefined) {
    if (view.kind === "rejected") return failTargetAnalysisInvariant("tsonic-csharp",
      `A rejected pointer view reached C# analysis: ${view.reason}`, subject);
    return Object.freeze({
      call: view.call, pointeeType: view.pointee,
      ...(view.explicitPointeeTypeNode === undefined ? {} : { explicitPointeeTypeNode: view.explicitPointeeTypeNode }),
      resultType: view.result, kind: "location-view", sourcePointeeType: view.source,
      locationExpression: view.pointer.expression, locationType: view.pointer.type,
      readExpression: view.read.expression, readType: view.read.type,
      writeExpression: view.write.expression, writeType: view.write.type, optional: view.optional,
    });
  }
  const record = facts.selections.pointerOperation(subject);
  // A refused marker pointer operation is a forwarded Host refusal; it selects no typed location.
  if (record === undefined || "kind" in record) return undefined;
  const operands = record.operands;
  if (record.call !== subject || operands.length !== markerArity[record.operation]) return failTargetAnalysisInvariant("tsonic-csharp",
    `The Host '${record.operation}' pointer record does not carry its ${markerArity[record.operation]} marker operands.`, subject);
  const location = (): Node => record.location ?? failTargetAnalysisInvariant("tsonic-csharp",
    `The Host '${record.operation}' pointer record has no location identity.`, subject);
  // The authored marker type arguments: project-pointer<F, T> authors F then T; every other marker authors T only.
  const authored = ast.typeArguments(subject);
  const explicitPointee = authored[record.operation === "project-pointer" ? 1 : 0];
  const base = {
    call: record.call, pointeeType: record.pointee,
    ...(explicitPointee === undefined ? {} : { explicitPointeeTypeNode: explicitPointee }),
    resultType: record.result,
  };
  const [first, second, third] = operands as readonly [Node, Node?, Node?];
  switch (record.operation) {
    case "address-of":
      return Object.freeze({ ...base, kind: "location-address", storageExpression: first, storageType: type(first),
        ...(record.storageDeclaration === undefined ? {} : { storageDeclaration: record.storageDeclaration }),
        locationIdentity: location() });
    case "allocate":
      return Object.freeze({ ...base, kind: "location-allocate", initialExpression: first, initialType: type(first),
        locationIdentity: location() });
    case "load":
      return Object.freeze({ ...base, kind: "location-load", locationExpression: first, locationType: type(first) });
    case "store":
      return Object.freeze({ ...base, kind: "location-store", locationExpression: first, locationType: type(first),
        valueExpression: second!, valueType: type(second!) });
    case "equal-pointer":
      return Object.freeze({ ...base, kind: "location-equal", leftExpression: first, leftType: type(first),
        rightExpression: second!, rightType: type(second!) });
    case "hash-pointer":
      return Object.freeze({ ...base, kind: "location-hash", locationExpression: first, locationType: type(first) });
    case "bind-pointer":
      return Object.freeze({ ...base, kind: "location-bind", identityExpression: first, identityType: type(first),
        readExpression: second!, readType: type(second!), writeExpression: third!, writeType: type(third!),
        locationIdentity: location() });
    case "project-pointer": {
      // F of project-pointer<F, T>: the pointee of the projected base location (the Host instantiation's first binder).
      const instantiation = facts.instantiations.at(subject);
      const sourcePointee = instantiation === undefined || instantiation.kind === "refused" ? undefined : instantiation.method[0]?.type;
      if (sourcePointee === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A Host project-pointer record has no published source pointee binder.", subject);
      const explicitSource = authored.length === 2 ? authored[0] : undefined;
      return Object.freeze({ ...base, kind: "location-project", sourcePointeeType: sourcePointee,
        ...(explicitSource === undefined ? {} : { explicitSourcePointeeTypeNode: explicitSource }),
        locationExpression: first, locationType: type(first),
        fromSourceExpression: second!, fromSourceType: type(second!), toSourceExpression: third!, toSourceType: type(third!) });
    }
  }
}
