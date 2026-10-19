import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassFactoryIndex } from "../../../target-model/records/class-factories.js";
import type { CsharpCaptureStorage } from "../../../target-model/records/capture-storage.js";
import type { CsharpProjectTypeClassifications } from "../../../target-model/records/project-types.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage.js";
import type { CsharpClassCaptureEmission, CsharpNativeClassEmission } from "../../../target-model/records/class-emission.js";
import type { CsharpNamePlan } from "../../../target-model/names/model.js";
import { createCsharpClassEmissionRecords } from "../../program/records/class-emission.js";

export function analyzeCsharpClassEmission(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly factories: CsharpClassFactoryIndex;
  readonly captures: CsharpCaptureStorage;
  readonly storage: CsharpStorageClassifications;
  readonly names: CsharpNamePlan;
  readonly admitted: (node: Node) => boolean;
}) {
  const classes = new Map<Node, CsharpNativeClassEmission>();
  const captures = new Map<Node, readonly CsharpClassCaptureEmission[]>();
  const issues: TargetDiagnostic[] = [];
  for (const node of input.nodes) {
    if ((!input.ast.is.IsClassDeclaration(node) && !input.ast.is.IsClassExpression(node)) || !input.admitted(node)) continue;
    const definition = input.projectTypes.definitionContainingDeclaration(node);
    if (definition === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted native class requires its exact source definition.", node);
    const factory = input.factories.classFactory.get(node);
    const selectedName = factory === undefined ? input.names.resolve(input.ast.name(node)) : { kind: "resolved" as const, name: factory.instanceName };
    if (selectedName.kind !== "resolved") failTargetAnalysisInvariant("tsonic-csharp", "An admitted native class requires its authored native name.", node);
    const members: Node[] = [];
    const staticMembers: Node[] = [];
    let authoredConstructor: Node | undefined;
    for (const member of input.ast.members(node)) {
      if (member === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted native class requires dense checked members.", node);
      const isStatic = input.ast.hasModifierKind(member, "static") || input.ast.is.IsClassStaticBlockDeclaration(member);
      if (isStatic) staticMembers.push(member);
      if ((!factory && !definition.staticCompanion) || !isStatic) members.push(member);
      if (input.ast.is.IsConstructorDeclaration(member) && input.ast.body(member) !== undefined && input.admitted(member)) {
        if (authoredConstructor !== undefined) failTargetAnalysisInvariant("tsonic-csharp", "A checked class requires one authored constructor implementation.", member);
        authoredConstructor = member;
      }
    }
    const implicit = input.projectTypes.implicitConstructorsForDeclaration(node);
    if (implicit === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted class requires its native implicit-constructor model.", node);
    let implicitCount = 0;
    for (const constructor of implicit) {
      const parameters = constructor.targetMember.parameters;
      let required = parameters.length;
      while (required > 0 && parameters[required - 1]?.csharpOmittableOptionalArgument === true) required -= 1;
      implicitCount += parameters.some(parameter => parameter.paramsArray === true) ? 1 : parameters.length - required + 1;
    }
    if (factory !== undefined && authoredConstructor === undefined && implicitCount > 1) {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "A local class factory requires one exact planned constructor and its environment parameter." });
      continue;
    }
    classes.set(node, Object.freeze({ name: selectedName.name, abstract: definition.abstract, staticCompanion: definition.staticCompanion,
      instanceMembers: Object.freeze(members), staticMembers: Object.freeze(staticMembers), authoredConstructor,
      factoryConstructor: authoredConstructor === undefined ? implicitCount === 0 ? "default" : "implicit" : "authored" }));
    if (factory === undefined) continue;
    const slots: CsharpClassCaptureEmission[] = [];
    const frames = new Set<Node>();
    for (const capture of factory.captures) {
      const shared = input.captures.capturedBinding.get(capture.declaration);
      if (shared !== undefined) {
        if (frames.has(shared.frame.scope)) continue;
        frames.add(shared.frame.scope);
        slots.push(Object.freeze({ kind: "frame", name: capture.fieldName, carrier: shared.frame.shape.targetType, frame: shared.frame }));
      } else slots.push(Object.freeze({ kind: input.storage.nativeBacking.get(capture.declaration) === undefined ? "expression" : "binding",
        name: capture.fieldName, carrier: input.captures.physicalStorageType.get(capture.declaration, capture.type),
        declaration: capture.declaration, reference: capture.reference }));
    }
    captures.set(node, Object.freeze(slots));
  }
  return Object.freeze({ records: createCsharpClassEmissionRecords(classes, captures), issues: Object.freeze(issues) });
}
