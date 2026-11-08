import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export async function shareBackup(name: string, content: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  const { uri } = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })
  try {
    await Share.share({ title: name, url: uri })
  } finally {
    await Filesystem.deleteFile({ path: name, directory: Directory.Cache })
  }
}
