using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    object? ToTypeExport(Type type, bool complete)
    {
        var typeParameters = TypeParameters(type);
        var members = complete ? Members(type).ToArray() : [];
        var conversionOperators = complete ? ConversionOperators(type).ToArray() : [];
        var unsupportedMembers = complete ? UnsupportedMembers(type) : [];
        var baseType = BaseType(type);
        var implementedContracts = ImplementedContracts(type);
        var unsupportedImplementedContracts = UnsupportedImplementedContracts(type);
        var sourceShape = ExportSourceShape(type);
        var attributes = complete
            ? AttributeFacts(type.GetCustomAttributesData(), "type", TargetId(type))
            : new AttributeCollection([], []);
        return new
        {
            kind = "type",
            typeKind = TypeKind(type),
            sourceName = ProviderSourceTypeName(type),
            sourceTypeFamily = ProviderSourceTypeFamilyObject(type),
            namespaceName = activeNamespaceName,
            targetId = TargetId(type),
            metadataName = MetadataName(type),
            assembly = AssemblyReference(type.Assembly),
            displayName = DisplayName(type),
            renderShape = RenderShape(type),
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            baseType,
            implementedContracts = implementedContracts.Length == 0 ? null : implementedContracts,
            unsupportedImplementedContracts = unsupportedImplementedContracts.Length == 0 ? null : unsupportedImplementedContracts,
            sourceShape,
            throwable = IsAssignableToRuntimeType(type, typeof(Exception)) ? true : (bool?)null,
            members = members.Length == 0 ? null : members,
            conversionOperators = conversionOperators.Length == 0 ? null : conversionOperators,
            unsupportedMembers = unsupportedMembers.Length == 0 ? null : unsupportedMembers,
        };
    }

    string? UnsupportedSourceExportReason(Type type)
    {
        if (!IsSourceIdentifier(ProviderSourceTypeName(type)))
        {
            return $"CLR type name '{MetadataName(type)}' is not an exact source identifier; provider aliases must be declared explicitly rather than synthesized.";
        }
        return IsDelegate(type) ? UnsupportedDelegateSourceShapeReason(type) : null;
    }

    string? UnsupportedDelegateSourceShapeReason(Type type)
    {
        var targetId = TargetId(type);
        if (delegateSourceShapeUnsupportedReasons.TryGetValue(targetId, out var cachedReason))
        {
            return cachedReason;
        }
        var reason = ComputeUnsupportedDelegateSourceShapeReason(type);
        if (reason is not null)
        {
            delegateSourceShapeUnsupportedReasons[targetId] = reason;
        }
        return reason;
    }

    string? ComputeUnsupportedDelegateSourceShapeReason(Type type)
    {
        var invoke = type.GetMethod("Invoke");
        if (invoke is null)
        {
            return "Delegate has no provider-visible Invoke method, so no source function declaration can be generated.";
        }
        if (Parameters(invoke.GetParameters()) is null)
        {
            return $"{UnsupportedParametersReason(invoke.GetParameters(), "Delegate invoke signature")}; the type is retained as target-only .NET data.";
        }
        var returnReason = UnsupportedReturnTypeReason(invoke, "Delegate invoke return type");
        return returnReason is null
            ? null
            : $"{returnReason}; the type is retained as target-only .NET data.";
    }

    object? BaseType(Type type)
    {
        if (!type.IsClass || IsDelegate(type) || type.BaseType is null || IsRuntimeType(type.BaseType, typeof(object)))
        {
            return null;
        }
        return TypeRef(type.BaseType);
    }

    static object ToUnsupportedTypeFamilyExport(string sourceName, IReadOnlyCollection<Type> types)
    {
        return new
        {
            kind = "unsupported-type-family",
            sourceName,
            reason = "Multiple CLR metadata types share this source name. This requires a provider type-family declaration model before it can be exposed safely.",
            targetIds = types.Select(TargetId).OrderBy(name => name, StringComparer.Ordinal).ToArray(),
            metadataNames = types.Select(MetadataName).OrderBy(name => name, StringComparer.Ordinal).ToArray(),
            assemblies = types.Select(type => AssemblyReference(type.Assembly)).ToArray(),
        };
    }

    object? ToUnsupportedTypeExport(Type type, string? reason)
    {
        if (reason is null)
        {
            return null;
        }
        return new
        {
            kind = "unsupported-type-export",
            sourceName = ProviderSourceTypeName(type),
            targetId = TargetId(type),
            metadataName = MetadataName(type),
            assembly = AssemblyReference(type.Assembly),
            reason,
        };
    }

}
