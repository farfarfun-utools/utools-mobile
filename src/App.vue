<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Browser } from "@capacitor/browser";
import { Clipboard } from "@capacitor/clipboard";
import {
  Bookmark,
  Check,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileUp,
  KeyRound,
  Link2,
  MoreVertical,
  Plus,
  ScanLine,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-vue-next";
import { shareBackup } from "./backup";
import { readData, writeData } from "./storage";
import {
  accountKey,
  accountLabel,
  createId as otpId,
  normalizeAccount,
  type Account,
  type StoredAccount,
} from "./shared/otp/core";
import { isValidSecret } from "./shared/otp/base32";
import {
  counterFor,
  formatCode,
  generateOtp,
  remainingSeconds,
} from "./shared/otp/otp";
import { parseMigrationUri, parseOtpauthUri } from "./shared/otp/otpauth";
import {
  emptyState as emptyOtp,
  prepareState as prepareOtp,
  type FunOtpState,
} from "./shared/otp/state";
import {
  createId as linkId,
  displayHost,
  fillQueryPlaceholder,
  hasQueryPlaceholder,
  initials,
  normalizeUrl,
} from "./shared/link/core";
import {
  categoryIdsOf,
  emptyState as emptyLinks,
  prepareState as prepareLinks,
} from "./shared/link/state";
import { visibleBookmarks } from "./shared/link/views";
import type { AppState, Bookmark as LinkBookmark } from "./shared/link/types";

type Tab = "otp" | "links";
const tab = ref<Tab>("otp");
const ready = ref(false);
const busy = ref(false);
const message = ref("");
const otpBlocked = ref("");
const linkBlocked = ref("");
const otp = ref<FunOtpState>(emptyOtp());
const links = ref<AppState>(emptyLinks());
const query = ref("");
const linkView = ref("all");
const sheet = ref<"otp" | "link" | "data" | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const qrInput = ref<HTMLInputElement | null>(null);
const importTarget = ref<Tab>("otp");
const now = ref(Date.now());
const codes = ref<Record<string, string>>({});
const otpDraft = ref<Account>({
  type: "totp",
  algorithm: "SHA1",
  digits: 6,
  period: 30,
});
const linkDraft = ref<Partial<LinkBookmark>>({});
const linkCategory = ref("cat@default");
let timer: ReturnType<typeof setInterval> | undefined;
let refreshId = 0;

const otpItems = computed(() =>
  otp.value.accounts.filter(
    (item) =>
      !item.deletedAt &&
      accountLabel(item).toLowerCase().includes(query.value.toLowerCase()),
  ),
);
const linkItems = computed(() =>
  visibleBookmarks(
    { ...links.value, currentView: linkView.value },
    query.value,
  ),
);
const activeBlocked = computed(() =>
  tab.value === "otp" ? otpBlocked.value : linkBlocked.value,
);
const count = computed(() =>
  tab.value === "otp"
    ? otp.value.accounts.filter((item) => !item.deletedAt).length
    : links.value.bookmarks.filter((item) => !item.deletedAt).length,
);

function alertError(error: unknown) {
  message.value = error instanceof Error ? error.message : String(error);
}

async function refreshCodes() {
  const id = ++refreshId;
  const timestamp = Date.now();
  now.value = timestamp;
  const result: Record<string, string> = {};
  await Promise.all(
    otp.value.accounts
      .filter((item) => !item.deletedAt)
      .map(async (item) => {
        try {
          result[item.id] = await generateOtp({
            ...item,
            counter: counterFor(item, timestamp),
          });
        } catch {
          result[item.id] = "无法计算";
        }
      }),
  );
  if (id === refreshId) codes.value = result;
}

async function saveOtp(next: FunOtpState) {
  if (otpBlocked.value) throw new Error(otpBlocked.value);
  await writeData("funotp-state-v1", next);
  otp.value = next;
  await refreshCodes();
}

async function saveLinks(next: AppState) {
  if (linkBlocked.value) throw new Error(linkBlocked.value);
  await writeData("funlink-state-v1", next);
  links.value = next;
}

function newOtp() {
  otpDraft.value = { type: "totp", algorithm: "SHA1", digits: 6, period: 30 };
  sheet.value = "otp";
}

function editOtp(account: StoredAccount) {
  otpDraft.value = { ...account };
  sheet.value = "otp";
}

async function commitOtp() {
  try {
    const input = { ...otpDraft.value };
    if (!isValidSecret(input.secret))
      throw new Error("请输入有效的 Base32 密钥");
    if (!String(input.issuer || input.name || "").trim())
      throw new Error("请填写服务商或账号名");
    const account = normalizeAccount({
      ...input,
      id: input.id || otpId("account"),
    }) as StoredAccount;
    if (
      otp.value.accounts.some(
        (item) =>
          item.id !== account.id &&
          !item.deletedAt &&
          accountKey(item) === accountKey(account),
      )
    )
      throw new Error("这个账号已经存在");
    const accounts = input.id
      ? otp.value.accounts.map((item) =>
          item.id === account.id ? account : item,
        )
      : [...otp.value.accounts, account];
    await saveOtp({ ...otp.value, accounts });
    sheet.value = null;
    message.value = input.id ? "账号已更新" : "账号已添加";
  } catch (error) {
    alertError(error);
  }
}

async function addOtpUri(uri: string) {
  const parsed = uri.trim().startsWith("otpauth-migration://")
    ? parseMigrationUri(uri)
    : [parseOtpauthUri(uri)];
  const known = new Set(
    otp.value.accounts.filter((item) => !item.deletedAt).map(accountKey),
  );
  const added: StoredAccount[] = [];
  for (const input of parsed) {
    if (known.has(accountKey(input))) continue;
    known.add(accountKey(input));
    added.push(
      normalizeAccount({ ...input, id: otpId("account") }) as StoredAccount,
    );
  }
  if (!added.length) throw new Error("这些账号已存在");
  await saveOtp({ ...otp.value, accounts: [...otp.value.accounts, ...added] });
  sheet.value = null;
  message.value = `已添加 ${added.length} 个账号`;
}

async function qrSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });
    const { decodeQrImage } = await import("./shared/otp/qr");
    await addOtpUri(await decodeQrImage(source));
  } catch (error) {
    alertError(error);
  }
  if (qrInput.value) qrInput.value.value = "";
}

async function copyOtp(account: StoredAccount) {
  try {
    const code = codes.value[account.id];
    if (!code || code === "无法计算") throw new Error("验证码尚未就绪");
    if (account.type === "hotp") {
      await saveOtp({
        ...otp.value,
        accounts: otp.value.accounts.map((item) =>
          item.id === account.id
            ? { ...item, counter: (item.counter || 0) + 1 }
            : item,
        ),
      });
    }
    await Clipboard.write({ string: code });
    message.value = "验证码已复制";
  } catch (error) {
    alertError(error);
  }
}

async function removeOtp(account: StoredAccount) {
  if (!confirm(`删除 ${accountLabel(account)}？删除后只能通过备份恢复。`))
    return;
  try {
    await saveOtp({
      ...otp.value,
      accounts: otp.value.accounts.filter((item) => item.id !== account.id),
    });
    sheet.value = null;
    message.value = "账号已删除";
  } catch (error) {
    alertError(error);
  }
}

function newLink() {
  linkDraft.value = { title: "", url: "" };
  linkCategory.value = linkView.value.startsWith("category:")
    ? linkView.value.slice(9)
    : "cat@default";
  sheet.value = "link";
}

function editLink(bookmark: LinkBookmark) {
  linkDraft.value = { ...bookmark };
  linkCategory.value = categoryIdsOf(bookmark)[0] || "cat@default";
  sheet.value = "link";
}

async function commitLink() {
  try {
    const url = normalizeUrl(linkDraft.value.url);
    if (!/^https?:/.test(url))
      throw new Error("手机版暂只支持 http 和 https 网址");
    const title = String(linkDraft.value.title || "").trim();
    if (!title) throw new Error("请输入名称");
    const original = linkDraft.value.id
      ? links.value.bookmarks.find((item) => item.id === linkDraft.value.id)
      : undefined;
    const bookmark: LinkBookmark = {
      ...original,
      ...linkDraft.value,
      id: original?.id || linkId("bookmark"),
      title,
      url,
      categoryIds: [linkCategory.value],
      categoryId: linkCategory.value,
    };
    const bookmarks = original
      ? links.value.bookmarks.map((item) =>
          item.id === original.id ? bookmark : item,
        )
      : [...links.value.bookmarks, bookmark];
    await saveLinks({ ...links.value, bookmarks });
    sheet.value = null;
    message.value = original ? "收藏已更新" : "收藏已添加";
  } catch (error) {
    alertError(error);
  }
}

async function toggleFavorite(bookmark: LinkBookmark) {
  try {
    await saveLinks({
      ...links.value,
      bookmarks: links.value.bookmarks.map((item) =>
        item.id === bookmark.id ? { ...item, favorite: !item.favorite } : item,
      ),
    });
  } catch (error) {
    alertError(error);
  }
}

async function removeLink(bookmark: LinkBookmark) {
  if (!confirm(`将「${bookmark.title}」移入废纸篓？`)) return;
  try {
    await saveLinks({
      ...links.value,
      bookmarks: links.value.bookmarks.map((item) =>
        item.id === bookmark.id ? { ...item, deletedAt: Date.now() } : item,
      ),
    });
    sheet.value = null;
    message.value = "已移入废纸篓";
  } catch (error) {
    alertError(error);
  }
}

async function restoreLink(bookmark: LinkBookmark) {
  try {
    await saveLinks({
      ...links.value,
      bookmarks: links.value.bookmarks.map((item) =>
        item.id === bookmark.id ? { ...item, deletedAt: null } : item,
      ),
    });
    message.value = "收藏已恢复";
  } catch (error) {
    alertError(error);
  }
}

async function openLink(bookmark: LinkBookmark) {
  try {
    let url = bookmark.url;
    if (hasQueryPlaceholder(url)) {
      const keyword = prompt("搜索关键词");
      if (!keyword) return;
      url = fillQueryPlaceholder(url, keyword);
    }
    if (!/^https?:\/\//i.test(url))
      throw new Error("手机版暂不能打开这个网址协议");
    await Browser.open({ url });
  } catch (error) {
    alertError(error);
  }
}

function openData() {
  importTarget.value = tab.value;
  sheet.value = "data";
}

async function importSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    const raw = JSON.parse(await file.text());
    if (importTarget.value === "otp") {
      const { state, dropped } = prepareOtp(raw);
      if (
        !confirm(
          `用备份中的 ${state.accounts.length} 个 OTP 账号替换手机现有数据？`,
        )
      )
        return;
      await writeData("funotp-state-v1", state);
      otpBlocked.value = "";
      otp.value = state;
      await refreshCodes();
      message.value = dropped
        ? `已导入，跳过 ${dropped} 条无效账号`
        : "OTP 备份已导入";
    } else {
      const { state, dropped } = prepareLinks(raw);
      if (
        !confirm(
          `用备份中的 ${state.bookmarks.length} 条收藏替换手机现有数据？`,
        )
      )
        return;
      await writeData("funlink-state-v1", state);
      linkBlocked.value = "";
      links.value = state;
      message.value = dropped
        ? `已导入，跳过 ${dropped} 条无效网址`
        : "收藏夹备份已导入";
    }
    sheet.value = null;
  } catch (error) {
    alertError(error);
  } finally {
    busy.value = false;
    if (fileInput.value) fileInput.value.value = "";
  }
}

async function exportData() {
  const target = importTarget.value;
  if (
    !confirm(
      target === "otp"
        ? "备份包含明文 OTP 密钥，确认导出？"
        : "备份包含网址和笔记，确认导出？",
    )
  )
    return;
  try {
    const name = `${target === "otp" ? "funotp" : "funlink"}-${new Date().toISOString().slice(0, 10)}.json`;
    await shareBackup(
      name,
      JSON.stringify(target === "otp" ? otp.value : links.value, null, 2),
    );
  } catch (error) {
    alertError(error);
  }
}

onMounted(async () => {
  const [otpResult, linkResult] = await Promise.allSettled([
    readData("funotp-state-v1"),
    readData("funlink-state-v1"),
  ]);
  if (otpResult.status === "fulfilled") {
    try {
      const loaded =
        otpResult.value === null
          ? { state: emptyOtp(), dropped: 0 }
          : prepareOtp(otpResult.value);
      if (loaded.dropped)
        throw new Error(`${loaded.dropped} 条账号无法解析，请从备份恢复`);
      otp.value = loaded.state;
    } catch (error) {
      otpBlocked.value = `OTP 数据无法读取：${String(error)}`;
    }
  } else otpBlocked.value = `OTP 存储不可用：${String(otpResult.reason)}`;
  if (linkResult.status === "fulfilled") {
    try {
      const loaded =
        linkResult.value === null
          ? { state: emptyLinks(), dropped: 0 }
          : prepareLinks(linkResult.value);
      if (loaded.dropped)
        throw new Error(`${loaded.dropped} 条收藏无法解析，请从备份恢复`);
      links.value = loaded.state;
    } catch (error) {
      linkBlocked.value = `收藏夹数据无法读取：${String(error)}`;
    }
  } else linkBlocked.value = `收藏夹存储不可用：${String(linkResult.reason)}`;
  ready.value = true;
  void refreshCodes();
  timer = setInterval(() => {
    void refreshCodes();
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">F</span><span>FunMobile</span>
      </div>
      <button
        class="icon-button"
        type="button"
        aria-label="数据导入与导出"
        title="数据导入与导出"
        @click="openData"
      >
        <MoreVertical :size="21" />
      </button>
    </header>

    <main v-if="ready" class="content">
      <div class="section-head">
        <div>
          <p class="eyebrow">
            {{ tab === "otp" ? "安全验证" : "我的网络收藏" }}
          </p>
          <h1>{{ tab === "otp" ? "验证码" : "收藏夹" }}</h1>
        </div>
        <span class="count">{{ count }}</span>
      </div>
      <div v-if="activeBlocked" class="error-banner" role="alert">
        {{ activeBlocked }}。请导入有效备份恢复。
      </div>
      <label class="search-field"
        ><Search :size="19" /><input
          v-model="query"
          :placeholder="tab === 'otp' ? '搜索账号' : '搜索名称或网址'"
          autocomplete="off" /><button
          v-if="query"
          class="icon-button small"
          type="button"
          aria-label="清除搜索"
          @click="query = ''"
        >
          <X :size="16" /></button
      ></label>

      <template v-if="tab === 'otp'">
        <div class="list-head"><span>账号</span><span>当前验证码</span></div>
        <div v-if="!otpItems.length" class="empty-state">
          <KeyRound :size="30" /><strong>{{
            query ? "没有匹配的账号" : "还没有 OTP 账号"
          }}</strong>
        </div>
        <div v-else class="item-list">
          <article
            v-for="account in otpItems"
            :key="account.id"
            class="otp-row"
          >
            <button
              type="button"
              class="account-info"
              @click="editOtp(account)"
            >
              <span class="avatar" :style="{ background: account.color }">{{
                account.icon || account.issuer?.slice(0, 2) || "OT"
              }}</span
              ><span class="account-text"
                ><strong>{{ account.issuer || account.name }}</strong
                ><small>{{
                  account.issuer
                    ? account.name
                    : account.type === "hotp"
                      ? "HOTP"
                      : "TOTP"
                }}</small></span
              >
            </button>
            <button
              type="button"
              class="code-button"
              :aria-label="`复制 ${account.issuer || account.name} 验证码`"
              @click="copyOtp(account)"
            >
              <strong>{{ formatCode(codes[account.id] || "······") }}</strong
              ><span>{{
                account.type === "hotp"
                  ? "计数型"
                  : `${remainingSeconds(now, account.period)} 秒`
              }}</span>
            </button>
          </article>
        </div>
      </template>

      <template v-else>
        <div class="filter-bar" aria-label="收藏分类">
          <button
            :class="{ selected: linkView === 'all' }"
            @click="linkView = 'all'"
          >
            全部</button
          ><button
            :class="{ selected: linkView === 'favorites' }"
            @click="linkView = 'favorites'"
          >
            常用</button
          ><button
            v-for="category in links.categories"
            :key="category.id"
            :class="{ selected: linkView === `category:${category.id}` }"
            @click="linkView = `category:${category.id}`"
          >
            {{ category.name }}</button
          ><button
            :class="{ selected: linkView === 'trash' }"
            @click="linkView = 'trash'"
          >
            废纸篓
          </button>
        </div>
        <div v-if="!linkItems.length" class="empty-state">
          <Bookmark :size="30" /><strong>{{
            query ? "没有匹配的收藏" : "这里还没有收藏"
          }}</strong>
        </div>
        <div v-else class="item-list link-list">
          <article v-for="item in linkItems" :key="item.id" class="link-row">
            <button
              type="button"
              class="link-main"
              @click="item.deletedAt ? restoreLink(item) : openLink(item)"
            >
              <span
                class="link-avatar"
                :style="{ background: item.color || '#177d71' }"
                >{{ initials(item.title) }}</span
              ><span class="link-text"
                ><strong>{{ item.title }}</strong
                ><small
                  >{{ displayHost(item.url)
                  }}<template v-if="item.description">
                    · {{ item.description }}</template
                  ></small
                ></span
              ><ChevronRight :size="18" class="chevron" />
            </button>
            <button
              v-if="!item.deletedAt"
              class="icon-button favorite"
              type="button"
              :aria-label="item.favorite ? '取消常用' : '设为常用'"
              @click="toggleFavorite(item)"
            >
              <Star
                :size="19"
                :fill="item.favorite ? 'currentColor' : 'none'"
                :class="{ active: item.favorite }"
              />
            </button>
            <button
              v-if="!item.deletedAt"
              class="icon-button"
              type="button"
              :aria-label="`编辑 ${item.title}`"
              @click="editLink(item)"
            >
              <MoreVertical :size="19" />
            </button>
            <button v-else class="restore-button" @click="restoreLink(item)">
              恢复
            </button>
          </article>
        </div>
      </template>
    </main>
    <main v-else class="loading">正在读取数据…</main>

    <button
      v-if="ready && !activeBlocked && (tab === 'otp' || linkView !== 'trash')"
      type="button"
      class="fab"
      :aria-label="tab === 'otp' ? '添加 OTP 账号' : '添加收藏'"
      @click="tab === 'otp' ? newOtp() : newLink()"
    >
      <Plus :size="25" />
    </button>
    <nav class="bottom-nav" aria-label="主导航">
      <button
        type="button"
        :class="{ active: tab === 'otp' }"
        @click="
          tab = 'otp';
          query = '';
        "
      >
        <KeyRound :size="21" /><span>OTP</span></button
      ><button
        type="button"
        :class="{ active: tab === 'links' }"
        @click="
          tab = 'links';
          query = '';
        "
      >
        <Link2 :size="21" /><span>收藏夹</span>
      </button>
    </nav>

    <div v-if="message" class="toast" role="status">
      <span>{{ message }}</span
      ><button type="button" aria-label="关闭提示" @click="message = ''">
        <X :size="16" />
      </button>
    </div>
    <div v-if="sheet" class="sheet-backdrop" @click.self="sheet = null">
      <section
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="
          sheet === 'otp' ? 'OTP 账号' : sheet === 'link' ? '收藏' : '数据管理'
        "
      >
        <div class="sheet-header">
          <h2>
            {{
              sheet === "otp"
                ? otpDraft.id
                  ? "编辑账号"
                  : "添加账号"
                : sheet === "link"
                  ? linkDraft.id
                    ? "编辑收藏"
                    : "添加收藏"
                  : "数据管理"
            }}
          </h2>
          <button
            class="icon-button"
            type="button"
            aria-label="关闭"
            @click="sheet = null"
          >
            <X :size="20" />
          </button>
        </div>
        <template v-if="sheet === 'otp'"
          ><div class="sheet-body">
            <label
              >服务商<input
                v-model="otpDraft.issuer"
                placeholder="例如 GitHub" /></label
            ><label
              >账号<input
                v-model="otpDraft.name"
                placeholder="邮箱或用户名" /></label
            ><label
              >Base32 密钥<input
                v-model="otpDraft.secret"
                autocomplete="off"
                autocapitalize="characters"
                placeholder="输入密钥"
            /></label>
            <div class="field-pair">
              <label
                >类型<select v-model="otpDraft.type">
                  <option value="totp">TOTP</option>
                  <option value="hotp">HOTP</option>
                </select></label
              ><label
                >算法<select v-model="otpDraft.algorithm">
                  <option>SHA1</option>
                  <option>SHA256</option>
                  <option>SHA512</option>
                </select></label
              >
            </div>
            <div class="field-pair">
              <label
                >位数<input
                  v-model.number="otpDraft.digits"
                  type="number"
                  min="4"
                  max="10" /></label
              ><label
                >{{ otpDraft.type === "hotp" ? "计数器" : "周期（秒）"
                }}<input
                  v-if="otpDraft.type === 'hotp'"
                  v-model.number="otpDraft.counter"
                  type="number"
                  min="0" /><input
                  v-else
                  v-model.number="otpDraft.period"
                  type="number"
                  min="1"
                  max="3600"
              /></label>
            </div>
            <button
              v-if="!otpDraft.id"
              type="button"
              class="secondary-action"
              @click="qrInput?.click()"
            >
              <ScanLine :size="19" />扫描二维码图片</button
            ><input
              ref="qrInput"
              class="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              @change="qrSelected"
            />
          </div>
          <div class="sheet-actions">
            <button
              v-if="otpDraft.id"
              type="button"
              class="danger-action"
              @click="removeOtp(otpDraft as StoredAccount)"
            >
              <Trash2 :size="18" />删除</button
            ><button type="button" class="primary-action" @click="commitOtp">
              <Check :size="18" />保存账号
            </button>
          </div></template
        >
        <template v-else-if="sheet === 'link'"
          ><div class="sheet-body">
            <label
              >名称<input
                v-model="linkDraft.title"
                placeholder="收藏名称" /></label
            ><label
              >网址<input
                v-model="linkDraft.url"
                type="url"
                inputmode="url"
                placeholder="https://example.com" /></label
            ><label
              >说明<input
                v-model="linkDraft.description"
                placeholder="可选" /></label
            ><label
              >分类<select v-model="linkCategory">
                <option value="cat@default">收集箱</option>
                <option
                  v-for="category in links.categories"
                  :key="category.id"
                  :value="category.id"
                >
                  {{ category.name }}
                </option>
              </select></label
            >
          </div>
          <div class="sheet-actions">
            <button
              v-if="linkDraft.id"
              type="button"
              class="danger-action"
              @click="removeLink(linkDraft as LinkBookmark)"
            >
              <Trash2 :size="18" />删除</button
            ><button type="button" class="primary-action" @click="commitLink">
              <Check :size="18" />保存收藏
            </button>
          </div></template
        >
        <template v-else
          ><div class="sheet-body">
            <div class="segmented">
              <button
                :class="{ selected: importTarget === 'otp' }"
                @click="importTarget = 'otp'"
              >
                OTP</button
              ><button
                :class="{ selected: importTarget === 'links' }"
                @click="importTarget = 'links'"
              >
                收藏夹
              </button>
            </div>
            <button
              class="data-action"
              type="button"
              :disabled="busy"
              @click="fileInput?.click()"
            >
              <FileUp :size="20" /><span
                ><strong>导入备份</strong
                ><small>读取现有 FunOTP / FunLink JSON 备份</small></span
              ><ChevronRight :size="18" /></button
            ><input
              ref="fileInput"
              class="sr-only"
              type="file"
              accept=".json,application/json"
              @change="importSelected"
            /><button
              class="data-action"
              type="button"
              :disabled="busy"
              @click="exportData"
            >
              <FileDown :size="20" /><span
                ><strong>导出备份</strong
                ><small>通过 Android 分享面板保存文件</small></span
              ><ExternalLink :size="18" />
            </button></div
        ></template>
      </section>
    </div>
  </div>
</template>
