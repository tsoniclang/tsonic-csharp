using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    object? ToTypeExport(Type type)
    {
        var typeParameters = TypeParameters(type);
        var members = Members(type).ToArray();
        var conversionOperators = ConversionOperators(type).ToArray();
        var unsupportedMembers = UnsupportedMembers(type);
        var baseType = BaseType(type);
        var implementedContracts = ImplementedContracts(type);
        var unsupportedImplementedContracts = UnsupportedImplementedContracts(type);
        var sourceShape = ExportSourceShape(type);
        var attributes = AttributeFacts(type.GetCustomAttributesData(), "type", TargetId(type));
        return new
        {
            kind = "type",
            typeKind = TypeKind(type),
            sourceName = ProviderSourceTypeName(type),
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
            throwable = typeof(Exception).IsAssignableFrom(type) ? true : (bool?)null,
            members = members.Length == 0 ? null : members,
            conversionOperators = conversionOperators.Length == 0 ? null : conversionOperators,
            unsupportedMembers = unsupportedMembers.Length == 0 ? null : unsupportedMembers,
        };
    }

    string? UnsupportedSourceExportReason(Type type)
    {
        return IsDelegate(type) ? UnsupportedDelegateSourceShapeReason(type) : null;
    }

    string? UnsupportedDelegateSourceShapeReason(Type type)
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
        var returnReason = UnsupportedReturnTypeReason(invoke.ReturnType, "Delegate invoke return type");
        return returnReason is null
            ? null
            : $"{returnReason}; the type is retained as target-only .NET data.";
    }

    object? BaseType(Type type)
    {
        if (!type.IsClass || IsDelegate(type) || type.BaseType is null || type.BaseType == typeof(object))
        {
            return null;
        }
        return TypeRef(type.BaseType);
    }

    static object ToUnsupportedTypeFamilyExport(IGrouping<string, Type> group)
    {
        return new
        {
            kind = "unsupported-type-family",
            sourceName = group.Key,
            reason = "Multiple CLR metadata types share this source name. This requires a provider type-family declaration model before it can be exposed safely.",
            targetIds = group.Select(TargetId).OrderBy(name => name, StringComparer.Ordinal).ToArray(),
            metadataNames = group.Select(MetadataName).OrderBy(name => name, StringComparer.Ordinal).ToArray(),
            assemblies = group.Select(type => AssemblyReference(type.Assembly)).ToArray(),
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
