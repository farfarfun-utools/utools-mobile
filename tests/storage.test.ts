import { beforeEach, describe, expect, it, vi } from 'vitest'

const secure = vi.hoisted(() => ({
  keys: vi.fn<() => Promise<string[]>>(),
  getItem: vi.fn<(key: string) => Promise<string | null>>(),
  setItem: vi.fn<(key: string, value: string) => Promise<void>>(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: secure }))

import { readData, writeData } from '../src/storage'

describe('Android data protection', () => {
  beforeEach(() => vi.resetAllMocks())

  it('never treats undecryptable existing data as a new empty store', async () => {
    secure.keys.mockResolvedValue(['funotp-state-v1'])
    secure.getItem.mockResolvedValue(null)
    await expect(readData('funotp-state-v1')).rejects.toThrow('无法解密')
  })

  it('reports a failed encrypted write', async () => {
    secure.setItem.mockRejectedValue(new Error('keystore unavailable'))
    await expect(writeData('funotp-state-v1', { accounts: [] })).rejects.toThrow('keystore unavailable')
  })
})
