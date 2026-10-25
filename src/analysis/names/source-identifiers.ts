import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/class-factories.js";
import type { CsharpProjectEmissionRecords } from "../../target-model/records/project-emission.js";
import type { CsharpTypeParameterEmissionRecords } from "../../target-model/records/type-parameters.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpAdmittedIteration } from "../../target-model/records/selection.js";

export function analyzeCsharpIdentifierEmission(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly names: CsharpNamePlan;
  readonly factories: CsharpClassFactoryIndex;
  readonly projects: CsharpProjectEmissionRecords;
  readonly parameters: CsharpTypeParameterEmissionRecords;
  readonly operations: CsharpTargetOperationClassifications<CsharpAdmittedIteration>;
  readonly admitted: (node: Node) => boolean;
}): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const requests = new Map<Node, Set<string>>();
  const admit = (subject: Node, name: Node | undefined, description: string): void => {
    const selected = requests.get(subject) ?? new Set<string>();
    if (selected.has(description)) return;
    selected.add(description);
    requests.set(subject, selected);
    const resolution = input.names.resolve(name);
    if (name !== undefined && resolution.kind === "resolved") return;
    issues.push(Object.freeze({
      code: "CSHARP_UNSUPPORTED_NAME", category: "error", source: "tsonic-csharp", sourceNode: name ?? subject,
      message: name === undefined
        ? `${description} must be present for direct C# source emission; backend name synthesis is not allowed without finalized TSTS/provider facts.`
        : `${description} cannot be represented as an exact C# target name. ${resolution.kind === "rejected" ? resolution.reason : ""}`,
    }));
  };
  for (const node of new Set(input.nodes)) {
    if (!input.admitted(node)) continue;
    if (input.ast.is.IsClassDeclaration(node))
      admit(node, input.ast.name(node), input.factories.classFactory.get(node) !== undefined ? "Local class" : "Class name");
    if (input.ast.is.IsFunctionDeclaration(node) && input.ast.body(node) !== undefined)
      admit(node, input.ast.name(node), "Function name");
    const declaration = input.projects.projectSourceReference.get(node);
    if (declaration !== undefined && input.factories.classFactory.get(declaration) === undefined)
      admit(declaration, input.projects.projectSourceType.get(declaration)?.name, "Project source type reference");
    const parameter = input.parameters.typeParameterEmission.get(node);
    if (parameter !== undefined) admit(node, parameter.name, "Type parameter name");
    const iteration = input.operations.iteration.get(node);
    if (iteration?.kind === "resolved" && iteration.iterationKind === "for-in")
      admit(iteration.binding.node, iteration.binding.name, "For-in binding");
  }
  return Object.freeze(issues);
}
