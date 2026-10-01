import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { ScriptStorage } from '../utils/storage'

const listeners = new Map<string, Set<(value: unknown) => void>>()

export function useGMStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
    const [storedValue, setStoredValue] = useState<T>(() => ScriptStorage.get<T>(key) ?? initialValue)
    const initialValueRef = useRef(initialValue)
    initialValueRef.current = initialValue

    useEffect(() => {
        const onChange = (value: unknown) => setStoredValue(() => value as T)
        const subscribers = listeners.get(key) ?? new Set()
        listeners.set(key, subscribers)
        subscribers.add(onChange)
        // Catch writes between render and subscribing, and changes to the key.
        setStoredValue(() => ScriptStorage.get<T>(key) ?? initialValueRef.current)
        return () => {
            subscribers.delete(onChange)
            if (subscribers.size === 0) listeners.delete(key)
        }
    }, [key])

    const setValue = useCallback((value: T) => {
        ScriptStorage.set<T>(key, value)
        setStoredValue(() => value)
        listeners.get(key)?.forEach(listener => listener(value))
    }, [key])
    return [storedValue as T, setValue]
}
