using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

var request = Request.Parse(args);
if (request.NamespaceName.Length == 0 || request.ModuleSpecifier.Length == 0)
{
    Console.Error.WriteLine("Usage: dotnet-type-provider --namespace <namespace> --module-specifier <specifier> [--reference-dir <dir>] [--reference <assembly>]");
    return 2;
}

try
{
    var provider = new ReflectionProvider(request);
    var module = provider.GetModule();
    var options = new JsonSerializerOptions
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };
    Console.WriteLine(JsonSerializer.Serialize(module, options));
    return 0;
}
catch (Exception exception)
{
    Console.Error.WriteLine(exception.Message);
    return 1;
}

sealed record Request(string NamespaceName, string ModuleSpecifier, string? ReferenceDirectory, IReadOnlyList<string> References)
{
    public static Request Parse(string[] args)
    {
        var namespaceName = "";
        var moduleSpecifier = "";
        string? referenceDirectory = null;
        var references = new List<string>();
        for (var index = 0; index < args.Length; index++)
        {
            var arg = args[index];
            switch (arg)
            {
                case "--namespace":
                    namespaceName = RequiredValue(args, ref index, arg);
                    break;
                case "--module-specifier":
                    moduleSpecifier = RequiredValue(args, ref index, arg);
                    break;
                case "--reference-dir":
                    referenceDirectory = RequiredValue(args, ref index, arg);
                    break;
                case "--reference":
                    references.Add(RequiredValue(args, ref index, arg));
                    break;
                default:
                    throw new InvalidOperationException($"Unknown argument '{arg}'.");
            }
        }
        return new Request(namespaceName, moduleSpecifier, referenceDirectory, references);
    }

    static string RequiredValue(string[] args, ref int index, string name)
    {
        if (index + 1 >= args.Length)
        {
            throw new InvalidOperationException($"Argument '{name}' requires a value.");
        }
        index++;
        return args[index];
    }
}

sealed class ReflectionProvider
{
    readonly Request request;
    readonly ConcurrentDictionary<string, Assembly> assembliesByPath = new(StringComparer.Ordinal);
    HashSet<string> providerReferenceNames = new(StringComparer.Ordinal);

    public ReflectionProvider(Request request)
    {
        this.request = request;
    }

    public object GetModule()
    {
        var allTypes = LoadTypes()
            .Where(type => type.Namespace == request.NamespaceName)
            .Where(type => type.IsPublic || type.IsNestedPublic)
            .Where(type => !type.IsSpecialName)
            .GroupBy(MetadataName, StringComparer.Ordinal)
            .Select(group => group.First())
            .OrderBy(type => MetadataName(type), StringComparer.Ordinal)
            .ToArray();
        var sourceGroups = allTypes
            .Where(type => !type.IsNested)
            .GroupBy(SourceTypeName, StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .ToArray();
        var exportTypes = sourceGroups
            .Where(group => group.Count() == 1)
            .Select(group => group.First())
            .ToArray();
        var exportTypeNames = exportTypes.Select(MetadataName).ToHashSet(StringComparer.Ordinal);
        var unsupportedExports = sourceGroups
            .Where(group => group.Count() > 1)
            .Select(ToUnsupportedTypeFamilyExport)
            .Concat(allTypes.Where(type => type.IsNested).Select(ToUnsupportedNestedTypeExport))
            .ToArray();
        var targetOnlyTypes = allTypes
            .Where(type => !exportTypeNames.Contains(MetadataName(type)))
            .Select(ToTypeExport)
            .Where(export => export is not null)
            .Cast<object>()
            .ToArray();

        providerReferenceNames = exportTypes.Select(SourceTypeName).ToHashSet(StringComparer.Ordinal);

        var exports = exportTypes
            .Select(ToTypeExport)
            .Where(export => export is not null)
            .Cast<object>()
            .ToArray();

        return new
        {
            moduleSpecifier = request.ModuleSpecifier,
            namespaceName = request.NamespaceName,
            exports,
            targetOnlyTypes = targetOnlyTypes.Length == 0 ? null : targetOnlyTypes,
            unsupportedExports = unsupportedExports.Length == 0 ? null : unsupportedExports,
        };
    }

    IEnumerable<Type> LoadTypes()
    {
        RuntimeAssemblyRoots();
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            foreach (var type in ExportedTypes(assembly))
            {
                yield return type;
            }
        }
        foreach (var path in AssemblyPaths())
        {
            Assembly assembly;
            try
            {
                assembly = assembliesByPath.GetOrAdd(path, static candidate => AssemblyLoadContext.Default.LoadFromAssemblyPath(candidate));
            }
            catch
            {
                continue;
            }

            foreach (var type in ExportedTypes(assembly))
            {
                yield return type;
            }
        }
    }

    static void RuntimeAssemblyRoots()
    {
        _ = typeof(object);
        _ = typeof(Console);
        _ = typeof(Math);
        _ = typeof(List<>);
        _ = typeof(Dictionary<,>);
        _ = typeof(File);
        _ = typeof(Path);
        _ = typeof(Enumerable);
    }

    static IEnumerable<Type> ExportedTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetExportedTypes();
        }
        catch (ReflectionTypeLoadException exception)
        {
            return exception.Types.Where(type => type is not null).Cast<Type>().ToArray();
        }
        catch
        {
            return Array.Empty<Type>();
        }
    }

    IEnumerable<string> AssemblyPaths()
    {
        var paths = new SortedSet<string>(StringComparer.Ordinal);
        var runtimeDirectory = Path.GetDirectoryName(typeof(object).Assembly.Location);
        if (runtimeDirectory is not null)
        {
            foreach (var path in Directory.EnumerateFiles(runtimeDirectory, "*.dll"))
            {
                paths.Add(Path.GetFullPath(path));
            }
        }
        if (request.ReferenceDirectory is not null && Directory.Exists(request.ReferenceDirectory))
        {
            foreach (var path in Directory.EnumerateFiles(request.ReferenceDirectory, "*.dll"))
            {
                paths.Add(Path.GetFullPath(path));
            }
        }
        foreach (var reference in request.References)
        {
            if (File.Exists(reference))
            {
                paths.Add(Path.GetFullPath(reference));
            }
        }
        return paths;
    }

    object? ToTypeExport(Type type)
    {
        var typeParameters = TypeParameters(type);
        var members = Members(type).ToArray();
        var implementedContracts = ImplementedContracts(type);
        var sourceShape = ExportSourceShape(type);
        if (IsDelegate(type) && sourceShape is null)
        {
            return null;
        }
        return new
        {
            kind = "type",
            typeKind = TypeKind(type),
            sourceName = SourceTypeName(type),
            namespaceName = request.NamespaceName,
            metadataName = MetadataName(type),
            displayName = DisplayName(type),
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            implementedContracts = implementedContracts.Length == 0 ? null : implementedContracts,
            sourceShape,
            members = members.Length == 0 ? null : members,
        };
    }

    static object ToUnsupportedTypeFamilyExport(IGrouping<string, Type> group)
    {
        return new
        {
            kind = "unsupported-type-family",
            sourceName = group.Key,
            reason = "Multiple CLR metadata types share this source name. This requires a provider type-family declaration model before it can be exposed safely.",
            metadataNames = group.Select(MetadataName).OrderBy(name => name, StringComparer.Ordinal).ToArray(),
        };
    }

    static object ToUnsupportedNestedTypeExport(Type type)
    {
        return new
        {
            kind = "unsupported-nested-type",
            sourceName = SourceTypeName(type),
            reason = "Nested CLR types require a provider nested-type declaration model before they can be exposed safely as source declarations.",
            metadataName = MetadataName(type),
            declaringMetadataName = type.DeclaringType is null ? null : MetadataName(type.DeclaringType),
        };
    }

    IEnumerable<object> Members(Type type)
    {
        foreach (var group in Constructors(type).GroupBy(member => (string)member.GetType().GetProperty("metadataName")!.GetValue(member)!))
        {
            foreach (var member in group)
            {
                yield return member;
            }
        }

        foreach (var member in Properties(type))
        {
            yield return member;
        }

        foreach (var member in Fields(type))
        {
            yield return member;
        }

        foreach (var group in Methods(type).GroupBy(MethodGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method)).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "method",
                sourceName = LowerCamel(first.Name),
                targetName = first.Name,
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                signatures,
            };
        }

        foreach (var group in Operators(type).GroupBy(MethodGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method)).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "operator",
                sourceName = OperatorSourceName(first.Name),
                targetName = first.Name,
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                signatures,
            };
        }
    }

    IEnumerable<object> Constructors(Type type)
    {
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).OrderBy(ConstructorId, StringComparer.Ordinal))
        {
            var signature = ConstructorSignature(type, constructor);
            if (signature is null)
            {
                continue;
            }
            yield return new
            {
                kind = "constructor",
                sourceName = "constructor",
                targetName = ".ctor",
                metadataName = ConstructorId(constructor),
                signatures = new[] { signature },
            };
        }
    }

    IEnumerable<object> Properties(Type type)
    {
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            var accessors = property.GetAccessors(false);
            if (accessors.Length == 0)
            {
                continue;
            }
            var indexParameters = property.GetIndexParameters();
            if (indexParameters.Length > 0)
            {
                if (indexParameters.Length != 1 || !IsIndexSignatureParameterType(indexParameters[0].ParameterType))
                {
                    continue;
                }
                var parameters = Parameters(indexParameters);
                var returnType = TypeRef(property.PropertyType);
                if (parameters is null || returnType is null)
                {
                    continue;
                }
                yield return new
                {
                    kind = "indexer",
                    sourceName = "item",
                    targetName = property.Name,
                    metadataName = $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})",
                    @static = accessors[0].IsStatic ? true : (bool?)null,
                    signatures = new[]
                    {
                        new
                        {
                            id = $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})",
                            targetName = property.Name,
                            parameters,
                            returnType,
                        },
                    },
                };
                continue;
            }

            var typeRef = TypeRef(property.PropertyType);
            if (typeRef is null)
            {
                continue;
            }
            var isStatic = accessors[0].IsStatic;
            if ((type.IsInterface && isStatic) || (isStatic && UsesDeclaringTypeParameter(property.PropertyType, type)))
            {
                continue;
            }
            yield return new
            {
                kind = "property",
                sourceName = LowerCamel(property.Name),
                targetName = property.Name,
                metadataName = $"{MetadataName(type)}.{property.Name}",
                @static = isStatic ? true : (bool?)null,
                type = typeRef,
            };
        }
    }

    IEnumerable<object> Fields(Type type)
    {
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(field => field.Name, StringComparer.Ordinal))
        {
            if (field.IsSpecialName)
            {
                continue;
            }
            var typeRef = TypeRef(field.FieldType);
            if (typeRef is null)
            {
                continue;
            }
            if ((type.IsInterface && field.IsStatic) || (field.IsStatic && UsesDeclaringTypeParameter(field.FieldType, type)))
            {
                continue;
            }
            yield return new
            {
                kind = "field",
                sourceName = LowerCamel(field.Name),
                targetName = field.Name,
                metadataName = $"{MetadataName(type)}.{field.Name}",
                @static = field.IsStatic ? true : (bool?)null,
                type = typeRef,
            };
        }
    }

    IEnumerable<MethodInfo> Methods(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Where(method => !(type.IsInterface && method.IsStatic))
            .Where(method => !(method.IsStatic && UsesDeclaringTypeParameter(method, type)))
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    IEnumerable<MethodInfo> Operators(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.IsSpecialName)
            .Where(method => method.Name.StartsWith("op_", StringComparison.Ordinal))
            .Where(method => !UsesDeclaringTypeParameter(method, type))
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    object? MethodSignature(MethodInfo method)
    {
        var parameters = Parameters(method.GetParameters());
        var returnType = TypeRef(method.ReturnType);
        if (parameters is null || returnType is null)
        {
            return null;
        }
        var typeParameters = MethodTypeParameters(method);
        return new
        {
            id = MethodId(method),
            targetName = method.Name,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            parameters,
            returnType,
        };
    }

    object? ConstructorSignature(Type type, ConstructorInfo constructor)
    {
        var parameters = Parameters(constructor.GetParameters());
        if (parameters is null)
        {
            return null;
        }
        return new
        {
            id = ConstructorId(constructor),
            parameters,
        };
    }

    object[]? Parameters(ParameterInfo[] parameters)
    {
        var result = new List<object>();
        for (var index = 0; index < parameters.Length; index++)
        {
            var parameter = parameters[index];
            var parameterType = UnwrapByRef(parameter.ParameterType);
            var type = TypeRef(parameterType);
            if (type is null)
            {
                return null;
            }
            var isParamsArray = parameter.GetCustomAttribute<ParamArrayAttribute>() is not null && parameterType.IsArray;
            result.Add(new
            {
                name = Identifier(parameter.Name ?? $"arg{index}"),
                type,
                passingMode = PassingMode(parameter),
                optional = parameter.IsOptional ? true : (bool?)null,
                rest = isParamsArray ? true : (bool?)null,
            });
        }
        return result.ToArray();
    }

    static string PassingMode(ParameterInfo parameter)
    {
        if (!parameter.ParameterType.IsByRef)
        {
            return "by-value";
        }
        if (parameter.IsOut)
        {
            return "byref-writeonly-must-init";
        }
        return parameter.GetCustomAttribute<System.Runtime.InteropServices.InAttribute>() is not null
            ? "byref-readonly"
            : "byref-readwrite";
    }

    object? TypeRef(Type type)
    {
        type = UnwrapByRef(type);
        if (type == typeof(void))
        {
            return new { kind = "void" };
        }
        var primitive = SourcePrimitiveName(type);
        if (primitive is not null)
        {
            return new { kind = "source-primitive", name = primitive };
        }
        if (type == typeof(string))
        {
            return new { kind = "named", metadataName = "System.String", displayName = "System.String", sourceShape = new { kind = "string" } };
        }
        if (type == typeof(object))
        {
            return new { kind = "object" };
        }
        if (type.IsGenericParameter)
        {
            return new { kind = "type-parameter", name = type.Name };
        }
        if (type.IsArray)
        {
            var elementType = TypeRef(type.GetElementType()!);
            return elementType is null
                ? null
                : new { kind = "array", elementType, rank = type.GetArrayRank() == 1 ? null : (int?)type.GetArrayRank() };
        }
        if (type.IsPointer)
        {
            return null;
        }
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        var typeArguments = type.IsGenericType && !type.IsGenericTypeDefinition
            ? type.GetGenericArguments().Select(TypeRef).ToArray()
            : Array.Empty<object?>();
        if (typeArguments.Any(argument => argument is null))
        {
            return null;
        }

        var sourceShape = SourceShape(type);
        return new
        {
            kind = "named",
            metadataName = MetadataName(definition),
            displayName = DisplayName(definition),
            typeArguments = typeArguments.Length == 0 ? null : typeArguments,
            sourceShape,
        };
    }

    object SourceShape(Type type)
    {
        if (IsDelegate(type))
        {
            var delegateShape = DelegateSourceShape(type);
            if (delegateShape is not null)
            {
                return delegateShape;
            }
        }
        if (type == typeof(string))
        {
            return new { kind = "string" };
        }
        if (type == typeof(object))
        {
            return new { kind = "object" };
        }
        var primitive = SourcePrimitiveName(type);
        if (primitive is not null)
        {
            return new { kind = "source-primitive", name = primitive };
        }
        if (type.IsArray)
        {
            var element = SourceShape(type.GetElementType()!);
            return new { kind = "array", elementType = element };
        }
        if (type.IsGenericParameter)
        {
            return new { kind = "type-parameter", name = type.Name };
        }
        if (IsEnumerableShape(type, out var enumerableElement))
        {
            return new { kind = "array", elementType = SourceShape(enumerableElement) };
        }
        if (type.Namespace == request.NamespaceName && providerReferenceNames.Contains(SourceTypeName(type.IsGenericType ? type.GetGenericTypeDefinition() : type)))
        {
            var args = type.IsGenericType
                ? type.GetGenericArguments().Select(SourceShape).ToArray()
                : Array.Empty<object>();
            return new
            {
                kind = "provider-ref",
                name = SourceTypeName(type.IsGenericType ? type.GetGenericTypeDefinition() : type),
                typeArguments = args.Length == 0 ? null : args,
            };
        }
        return new { kind = "object" };
    }

    object? ExportSourceShape(Type type)
    {
        return IsDelegate(type) ? DelegateSourceShape(type) : null;
    }

    object? DelegateSourceShape(Type type)
    {
        var invoke = type.GetMethod("Invoke");
        if (invoke is null)
        {
            return null;
        }
        var parameters = Parameters(invoke.GetParameters());
        var returnType = TypeRef(invoke.ReturnType);
        if (parameters is null || returnType is null)
        {
            return null;
        }
        return new
        {
            kind = "function",
            parameters,
            returnType,
        };
    }

    static bool IsEnumerableShape(Type type, out Type element)
    {
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        if (definition == typeof(IEnumerable<>) ||
            definition.FullName == "System.Collections.Generic.IReadOnlyList`1" ||
            definition.FullName == "System.Collections.Generic.ICollection`1" ||
            definition.FullName == "System.Collections.Generic.IList`1" ||
            definition.FullName == "System.Collections.Generic.IReadOnlyCollection`1")
        {
            element = type.GetGenericArguments()[0];
            return true;
        }
        element = typeof(object);
        return false;
    }

    static bool IsIndexSignatureParameterType(Type type)
    {
        type = UnwrapByRef(type);
        if (type == typeof(string) || type == typeof(char))
        {
            return true;
        }
        var primitive = SourcePrimitiveName(type);
        return primitive is not null && primitive != "bool" && primitive != "char";
    }

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

    static string TypeKind(Type type)
    {
        if (type.IsEnum)
        {
            return "enum";
        }
        if (IsDelegate(type))
        {
            return "delegate";
        }
        if (type.IsInterface)
        {
            return "interface";
        }
        if (type.IsValueType)
        {
            return "struct";
        }
        return "class";
    }

    static string? SourcePrimitiveName(Type type)
    {
        if (type == typeof(bool)) return "bool";
        if (type == typeof(char)) return "char";
        if (type == typeof(sbyte)) return "int8";
        if (type == typeof(byte)) return "uint8";
        if (type == typeof(short)) return "int16";
        if (type == typeof(ushort)) return "uint16";
        if (type == typeof(int)) return "int32";
        if (type == typeof(uint)) return "uint32";
        if (type == typeof(long)) return "int64";
        if (type == typeof(ulong)) return "uint64";
        if (type == typeof(IntPtr)) return "native-int";
        if (type == typeof(UIntPtr)) return "native-uint";
        if (type == typeof(Half)) return "float16";
        if (type == typeof(float)) return "float32";
        if (type == typeof(double)) return "float64";
        if (type == typeof(decimal)) return "decimal";
        if (type.FullName == "System.Int128") return "int128";
        if (type.FullName == "System.UInt128") return "uint128";
        return null;
    }

    static bool IsDelegate(Type type)
    {
        return type.BaseType is not null && typeof(MulticastDelegate).IsAssignableFrom(type.BaseType);
    }

    static bool UsesDeclaringTypeParameter(MethodInfo method, Type declaringType)
    {
        return UsesDeclaringTypeParameter(method.ReturnType, declaringType) ||
            method.GetParameters().Any(parameter => UsesDeclaringTypeParameter(parameter.ParameterType, declaringType));
    }

    static bool UsesDeclaringTypeParameter(Type type, Type declaringType)
    {
        type = UnwrapByRef(type);
        if (type.IsGenericParameter)
        {
            return type.DeclaringType == declaringType;
        }
        if (type.HasElementType)
        {
            return UsesDeclaringTypeParameter(type.GetElementType()!, declaringType);
        }
        return type.IsGenericType &&
            type.GetGenericArguments().Any(argument => UsesDeclaringTypeParameter(argument, declaringType));
    }

    static Type UnwrapByRef(Type type)
    {
        return type.IsByRef ? type.GetElementType()! : type;
    }

    static string MethodGroupKey(MethodInfo method)
    {
        return $"{method.IsStatic}:{method.Name}";
    }

    static string MethodId(MethodInfo method)
    {
        return $"{MetadataName(method.DeclaringType!)}.{method.Name}({string.Join(",", method.GetParameters().Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})";
    }

    static string ConstructorId(ConstructorInfo constructor)
    {
        return $"{MetadataName(constructor.DeclaringType!)}..ctor({string.Join(",", constructor.GetParameters().Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})";
    }

    static string TypeMetadataName(Type type)
    {
        type = UnwrapByRef(type);
        if (type.IsArray)
        {
            return $"{TypeMetadataName(type.GetElementType()!)}[]";
        }
        if (type.IsGenericParameter)
        {
            return type.Name;
        }
        if (type.IsGenericType && !type.IsGenericTypeDefinition)
        {
            return $"{MetadataName(type.GetGenericTypeDefinition())}<{string.Join(",", type.GetGenericArguments().Select(TypeMetadataName))}>";
        }
        return MetadataName(type);
    }

    static string MetadataName(Type type)
    {
        var name = type.FullName ?? type.Name;
        var genericArgumentStart = name.IndexOf("[[", StringComparison.Ordinal);
        return genericArgumentStart >= 0 ? name[..genericArgumentStart] : name.Replace('+', '.');
    }

    static string DisplayName(Type type)
    {
        return MetadataName(type).Replace('+', '.');
    }

    static string SourceTypeName(Type type)
    {
        var name = type.Name;
        var tick = name.IndexOf('`');
        return Identifier(tick < 0 ? name : name[..tick]);
    }

    static string LowerCamel(string name)
    {
        var source = name;
        var tick = source.IndexOf('`');
        if (tick >= 0)
        {
            source = source[..tick];
        }
        if (source.Length == 0)
        {
            return source;
        }
        if (source.Length == 1)
        {
            return Identifier(source.ToLowerInvariant());
        }
        return Identifier(char.ToLowerInvariant(source[0]) + source[1..]);
    }

    static string OperatorSourceName(string name)
    {
        return name.StartsWith("op_", StringComparison.Ordinal)
            ? LowerCamel(name[3..])
            : LowerCamel(name);
    }

    static string Identifier(string value)
    {
        if (value.Length == 0)
        {
            return "_";
        }
        var chars = value.Select((character, index) =>
            (index == 0 ? char.IsLetter(character) || character == '_' || character == '$' : char.IsLetterOrDigit(character) || character == '_' || character == '$')
                ? character
                : '_').ToArray();
        var result = new string(chars);
        return char.IsDigit(result[0]) ? $"_{result}" : result;
    }
}
