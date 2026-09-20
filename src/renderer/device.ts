// 设备与平台判定：手机端并不只是「窄屏的桌面」，而应当是独立的 App 形态
// （底部 Tab 栏、全屏播放页、手势切歌、安全区避让）。
// 这里统一给出判定函数与安全区读取，供 App / 样式 / 组件共用。

/** 是否为触摸为主的设备（手机、平板、触屏本） */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints || 0) > 0 ||
    window.matchMedia?.('(pointer: coarse)').matches === true
  )
}

/** 窄屏（手机竖屏 / 小屏设备），用于布局切换 */
export function isNarrowScreen(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 820
}

/**
 * 是否按「手机 App 形态」渲染。
 * 判据 = 触摸设备 且（窄屏 或 移动端 UA）。
 * 这样桌面窗口开窄了不会误判成手机，而手机即使横屏也能保持 App 布局。
 *
 * 支持 URL 强制覆盖，便于调试与在桌面上预览手机版：
 *   ?mobile=1 强制手机版；?mobile=0 强制桌面版。
 */
export function isMobileApp(): boolean {
  if (typeof window === 'undefined') return false

  const forced = new URLSearchParams(window.location.search).get('mobile')
  if (forced === '1') return true
  if (forced === '0') return false

  const ua = navigator.userAgent || ''
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|Windows Phone/i.test(ua)
  if (mobileUA) return true
  return isTouchDevice() && isNarrowScreen()
}

/** 读取 CSS 安全区（刘海 / 底部手势条）实际像素值，供内联样式的动态计算使用 */
export function safeArea(): { top: number; bottom: number; left: number; right: number } {
  if (typeof window === 'undefined') return { top: 0, bottom: 0, left: 0, right: 0 }
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);' +
    'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const top = parseFloat(cs.paddingTop) || 0
  const bottom = parseFloat(cs.paddingBottom) || 0
  const left = parseFloat(cs.paddingLeft) || 0
  const right = parseFloat(cs.paddingRight) || 0
  document.body.removeChild(probe)
  return { top, bottom, left, right }
}

/** 触发一次轻量触感反馈（安卓支持则震动 12ms，不支持静默忽略） */
export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* 部分浏览器禁用，忽略 */
  }
}
