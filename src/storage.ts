import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

export async function readData(key: string): Promise<unknown | null> {
  if (!Capacitor.isNativePlatform()) {
    const value = localStorage.getItem(key)
    return value === null ? null : JSON.parse(value)
  }
  const present = (await SecureStorage.keys()).includes(key)
  if (!present) return null
  const value = await SecureStorage.getItem(key)
  if (value === null) throw new Error('加密数据存在，但无法解密')
  return JSON.parse(value)
}

export async function writeData(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value)
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(key, serialized)
    return
  }
  await SecureStorage.setItem(key, serialized)
}
