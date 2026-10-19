namespace InheritanceProviderFixtures;

public class NativeBase<T>
{
    public T PublicField = default!;
    protected T ProtectedField = default!;
    internal T InternalField = default!;
    private protected T PrivateProtectedField = default!;
    public T PublicProperty => default!;
    protected T ProtectedProperty => default!;
    protected internal T FamilyOrAssemblyProperty => default!;
    internal T InternalProperty => default!;
    private T PrivateProperty => default!;
    public T this[int index] => default!;

    public event Action<T> PublicEvent { add { } remove { } }
    protected event Action<T> ProtectedEvent { add { } remove { } }
    internal event Action<T> InternalEvent { add { } remove { } }

    public void Visible(T value) { }
    protected void Protected(T value) { }
    protected internal void ProtectedOrInternal(T value) { }
    private void Private(T value) { }
    internal void Internal(T value) { }
    private protected void PrivateProtected(T value) { }
    public void Generic<TMethod>(T value, TMethod extra) { }
    public void Passing(ref T readwrite, in T read, out T write) => write = read;

    public class PublicNested<TNested> { }
    protected class ProtectedNested { }
    internal class InternalNested { }
    private class PrivateNested { }
}

public class ClosedBase : NativeBase<int> { }

public class CrossNamespaceBase : System.Collections.Generic.List<int> { }

public class EmptyNative { }

public abstract class DispatchBase<T>
{
    protected T stored = default!;
    public virtual T Transform(T value) => value;
    public abstract T AbstractTransform(T value);
    public virtual T Item { get => stored; protected set => stored = value; }
    public virtual T GetterOnly { get => stored; private set => stored = value; }
    public virtual event Action<T> Changed { add { } remove { } }
    public virtual ref T RefReturn() => ref stored;
    public virtual ref readonly T ReadonlyRefReturn() => ref stored;
    public virtual TMethod GenericSlot<TMethod>(ref T value, in TMethod read) => read;
}

public class DispatchDerived : DispatchBase<int>
{
    public sealed override int Transform(int value) => value + 1;
    public override int AbstractTransform(int value) => value + 2;
    public override int Item { get => stored; protected set => stored = value; }
    public override event Action<int> Changed { add { } remove { } }
    public override ref int RefReturn() => ref stored;
    public override ref readonly int ReadonlyRefReturn() => ref stored;
    public override TResult GenericSlot<TResult>(ref int value, in TResult read) => read;
}

public class SlotBase<T>
{
    public virtual T Apply(T value) => value;
    public virtual T NewSlot(T value) => value;
}

public class SlotDerived : SlotBase<int>
{
    public sealed override int Apply(int value) => value;
    public new virtual int NewSlot(int value) => value;
}

public class MiddleSlot : SlotBase<int>
{
    public new virtual int Apply(int value) => value;
}

public class LastSlot : MiddleSlot
{
    public override int Apply(int value) => value;
}

public class CovariantBase
{
    public virtual object Create() => new object();
}

public class CovariantDerived : CovariantBase
{
    public override string Create() => "native";
}

public class SameNameBase
{
    public virtual int Match(int value) => value;
}

public class SameNameDerived : SameNameBase
{
    public int Match(string value) => value.Length;
}
