namespace RecursiveDelegateFixtures;

public delegate void SelfRecursive(SelfRecursive next);

public delegate void MutuallyRecursiveA(MutuallyRecursiveB next);

public delegate void MutuallyRecursiveB(MutuallyRecursiveA next);

public delegate void Growing<T>(Growing<T[]> next);

public sealed class RecursiveDelegateConsumer
{
    public void Use(SelfRecursive callback)
    {
    }
}
