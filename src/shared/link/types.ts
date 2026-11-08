// 公开数据结构的类型定义。这里只约束 lib/* 纯函数之间传递的形状，
// 字段故意保持宽松（可选 + 索引签名），因为状态要兼容「网址精灵」旧备份
// 和早于 1.0 的本地存档，严格到完全对齐当前结构反而会把合法的旧数据挡在外面。

export type BrowserMode =
  | 'default' | 'system' | 'inner'
  | 'chrome' | 'chrome-incognito'
  | 'edge' | 'edge-inprivate'
  | 'safari' | 'firefox' | ''

export interface Bookmark {
  id: string
  title: string
  url: string
  urls?: string[]
  description?: string
  categoryId?: string
  categoryIds?: string[]
  previousCategoryIds?: string[]
  iconType?: 'text' | 'image'
  icon?: string
  /** 内联的图标 data URL。存得进附件时只留 iconRef，这个字段就不写了。 */
  iconData?: string
  /** 图标附件的 ID，内容哈希（见 lib/iconStore.ts）。 */
  iconRef?: string
  iconSize?: number
  color?: string
  browser?: BrowserMode
  favorite?: boolean
  quick?: boolean
  quickRegex?: string
  note?: string
  hasNote?: boolean
  deletedAt?: number | null
  [key: string]: unknown
}

export interface Category {
  id: string
  name: string
  parentId: string
  tabPosition?: 'top' | 'left' | 'right' | 'bottom'
}

/**
 * 分类管理面板发出的操作。
 *
 * 以前是 `(action: string, value: unknown)` 两个参数，每个分支都得自己把 value
 * 收窄回来：少写一次判断编译器也不会管。改成按 type 区分的联合类型后，
 * 每种操作各带自己的字段，漏字段或者写错字段都会在编译期报出来。
 */
export type CategoryAction =
  | { type: 'rename', name: string }
  /** confirmed 为 true 表示面板里已经二次确认过，不必再弹一次系统确认框。 */
  | { type: 'delete', confirmed: boolean }
  | { type: 'position', position: NonNullable<Category['tabPosition']> }
  /** targetId 为空表示移到 parentId 下的末尾，否则插到 targetId 前面。 */
  | { type: 'move', parentId: string, targetId: string }

export interface BrowserSettings {
  isOpenIn: boolean
  width: number
  height: number
}

export interface NavbarSettings {
  rounded: number
}

export interface Settings {
  browser: BrowserSettings
  search: string[]
  importSplit: string
  navbar: NavbarSettings
  /** 添加卡片时是否访问该网站取它的图标。关掉就只用文字图标或本地图片。 */
  autoIcon: boolean
}

export interface AppState {
  version: 1
  theme: 'system' | 'light' | 'dark'
  currentView: string
  lastCategoryId: string
  settings: Settings
  categories: Category[]
  bookmarks: Bookmark[]
}

/** 尚未补齐 settings/默认值的中间态，迁移/校验链路内部使用。 */
export type RawState = Omit<Partial<AppState>, 'categories' | 'bookmarks'> & {
  categories: Record<string, unknown>[]
  bookmarks: Record<string, unknown>[]
}
