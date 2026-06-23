using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    object[] TypeParameters(Type type)
    {
        return !type.IsGenericTypeDefinition
            ? Array.Empty<object>()
            : type.GetGenericArguments().Where(parameter => parameter.IsGenericParameter).Select(TypeParameter).ToArray();
    }

    object[] MethodTypeParameters(MethodInfo method)
    {
        return !method.IsGenericMethodDefinition
            ? Array.Empty<object>()
            : method.GetGenericArguments().Where(parameter => parameter.IsGenericParameter).Select(TypeParameter).ToArray();
    }

    object[] ImplementedContracts(Type type)
    {
        return type.GetInterfaces()
            .OrderBy(MetadataName, StringComparer.Ordinal)
            .Select(TypeRef)
            .Where(contract => contract is not null)
            .Select(contract => new { kind = "implements", contract })
            .ToArray();
    }

    object TypeParameter(Type parameter)
    {
        var constraints = new List<object>();
        var attributes = parameter.GenericParameterAttributes;
        if ((attributes & GenericParameterAttributes.ReferenceTypeConstraint) != 0)
        {
            constraints.Add(new { kind = "reference-type" });
        }
        if ((attributes & GenericParameterAttributes.NotNullableValueTypeConstraint) != 0)
        {
            constraints.Add(new { kind = "value-type" });
        }
        if ((attributes & GenericParameterAttributes.DefaultConstructorConstraint) != 0)
        {
            constraints.Add(new { kind = "constructible" });
        }
        foreach (var constraint in parameter.GetGenericParameterConstraints())
        {
            if (constraint == typeof(ValueType))
            {
                continue;
            }
            var contract = TypeRef(constraint);
            if (contract is not null)
            {
                constraints.Add(new { kind = "implements", contract });
            }
        }
        return new
        {
            name = parameter.Name,
            constraints = constraints.Count == 0 ? null : constraints,
            variance = Variance(parameter),
        };
    }

    static string? Variance(Type parameter)
    {
        var variance = parameter.GenericParameterAttributes & GenericParameterAttributes.VarianceMask;
        return variance switch
        {
            GenericParameterAttributes.Covariant => "out",
            GenericParameterAttributes.Contravariant => "in",
            _ => null,
        };
    }

}
