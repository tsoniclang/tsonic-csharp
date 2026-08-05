using System.Reflection;

sealed partial class ReflectionProvider
{
    sealed class GenericNullabilityContext
    {
        readonly IReadOnlyDictionary<Type, NullabilityInfo> typeArguments;
        readonly IReadOnlyDictionary<Type, NullableMetadata> typeArgumentMetadata;

        GenericNullabilityContext(
            IReadOnlyDictionary<Type, NullabilityInfo> typeArguments,
            IReadOnlyDictionary<Type, NullableMetadata> typeArgumentMetadata)
        {
            this.typeArguments = typeArguments;
            this.typeArgumentMetadata = typeArgumentMetadata;
        }

        public static GenericNullabilityContext Empty { get; } = new(
            new Dictionary<Type, NullabilityInfo>(),
            new Dictionary<Type, NullableMetadata>());

        public GenericNullabilityContext WithConstructedTypeArguments(
            Type genericTypeDefinition,
            Type constructedType,
            NullabilityInfo? constructedNullability,
            NullableMetadata? constructedNullabilityMetadata)
        {
            if (!genericTypeDefinition.IsGenericTypeDefinition || !constructedType.IsGenericType)
            {
                throw new InvalidOperationException("Delegate nullability substitution requires a generic type definition and a constructed generic type.");
            }
            if (constructedType.GetGenericTypeDefinition() != genericTypeDefinition)
            {
                throw new InvalidOperationException($"Delegate nullability type '{constructedType}' does not close '{genericTypeDefinition}'.");
            }
            var parameters = genericTypeDefinition.GetGenericArguments();
            var arguments = constructedType.GetGenericArguments();
            if (parameters.Length != arguments.Length)
            {
                throw new InvalidOperationException($"Delegate generic type '{constructedType}' has an inconsistent generic arity.");
            }
            if (constructedNullability is null && constructedNullabilityMetadata is null)
            {
                return this;
            }
            if (constructedNullability is not null && constructedNullability.Type.IsByRef)
            {
                if (constructedNullability.Type.GetElementType() != constructedType)
                {
                    throw new InvalidOperationException($"Delegate nullability type '{constructedNullability.Type}' does not match '{constructedType}'.");
                }
                if (constructedNullability.GenericTypeArguments.Length != parameters.Length)
                {
                    constructedNullability = null;
                }
            }
            else if (constructedNullability is not null && constructedNullability.Type != constructedType)
            {
                throw new InvalidOperationException($"Delegate nullability type '{constructedNullability.Type}' does not match '{constructedType}'.");
            }
            if (constructedNullability is not null && constructedNullability.GenericTypeArguments.Length != parameters.Length)
            {
                throw new InvalidOperationException($"Delegate nullability for '{constructedType}' has an inconsistent generic arity.");
            }
            if (constructedNullability is null && constructedNullabilityMetadata is null)
            {
                return this;
            }
            if (constructedNullabilityMetadata is not null && constructedNullabilityMetadata.GenericTypeArguments.Count != parameters.Length)
            {
                throw new InvalidOperationException($"Delegate nullable metadata for '{constructedType}' has an inconsistent generic arity.");
            }

            var next = new Dictionary<Type, NullabilityInfo>(typeArguments);
            var nextMetadata = new Dictionary<Type, NullableMetadata>(typeArgumentMetadata);
            for (var index = 0; index < parameters.Length; index++)
            {
                if (constructedNullability is not null)
                {
                    next[parameters[index]] = constructedNullability.GenericTypeArguments[index];
                }
                if (constructedNullabilityMetadata is not null)
                {
                    nextMetadata[parameters[index]] = constructedNullabilityMetadata.GenericTypeArguments[index];
                }
            }
            return new GenericNullabilityContext(next, nextMetadata);
        }

        public NullabilityInfo? Resolve(Type type, NullabilityInfo? fallback)
        {
            return type.IsGenericParameter && typeArguments.TryGetValue(type, out var useSite)
                ? useSite
                : fallback;
        }

        public NullableMetadata? ResolveMetadata(Type type, NullableMetadata? fallback)
        {
            return type.IsGenericParameter && typeArgumentMetadata.TryGetValue(type, out var useSite)
                ? useSite
                : fallback;
        }
    }
}
