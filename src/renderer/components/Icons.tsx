// 统一的矢量图标集（内联 SVG，不依赖图标库）。
// 全部使用 currentColor 描边/填充，配合 CSS 控制尺寸与颜色，替代原先散落的 emoji，
// 保证在 Linux / Windows / macOS 下渲染完全一致，观感对齐 Apple Music 的线性图标风格。
import type { CSSProperties } from 'react'

export interface IconProps {
  size?: number
  className?: string
  style?: CSSProperties
  strokeWidth?: number
}

type P = IconProps

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true as const,
  focusable: 'false' as const
})

/* ============ 播放控制 ============ */

export const IconPlay = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M7.5 4.9c0-1 1.08-1.62 1.94-1.12l10.3 6.1c.86.5.86 1.74 0 2.24l-10.3 6.1c-.86.5-1.94-.12-1.94-1.12V4.9Z" fill="currentColor" />
  </svg>
)

export const IconPause = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="6.5" y="4.5" width="4" height="15" rx="1.6" fill="currentColor" />
    <rect x="13.5" y="4.5" width="4" height="15" rx="1.6" fill="currentColor" />
  </svg>
)

export const IconPrev = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M7 5.2c0-.66.54-1.2 1.2-1.2s1.2.54 1.2 1.2v5.23l7.1-5.9c.78-.65 1.98-.1 1.98.93v11.08c0 1.02-1.2 1.58-1.99.92l-7.09-5.89v5.23c0 .66-.54 1.2-1.2 1.2S7 17.46 7 16.8V5.2Z" fill="currentColor" />
  </svg>
)

export const IconNext = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M17 5.2c0-.66-.54-1.2-1.2-1.2s-1.2.54-1.2 1.2v5.23l-7.1-5.9C6.72 3.88 5.52 4.43 5.52 5.46v11.08c0 1.02 1.2 1.58 1.99.92l7.09-5.89v5.23c0 .66.54 1.2 1.2 1.2s1.2-.54 1.2-1.2V5.2Z" fill="currentColor" />
  </svg>
)

export const IconShuffle = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M16.5 4.5 21 8.5l-4.5 4v-2.6h-1.33c-.9 0-1.24.3-1.9 1.15l-.3.38-1.1-1.42.24-.3c.92-1.16 1.6-1.71 3.06-1.71H16.5V4.5Z" fill="currentColor" />
    <path d="M3 5.9c1.9 0 3.16.53 4.3 1.72l.4.42-1.1 1.43-.42-.44C5.35 8.13 4.5 7.8 3 7.8V5.9Z" fill="currentColor" />
    <path d="M16.5 15.6h-1.33c-1.46 0-2.14-.55-3.06-1.7l-3.8-4.9C7.16 7.64 6.03 7 4.4 7H3v2h1.4c1.05 0 1.57.3 2.28 1.22l3.8 4.9c1.14 1.48 2.4 2.48 4.69 2.48H16.5v2.6L21 16.2l-4.5-4v3.4Z" fill="currentColor" />
  </svg>
)

export const IconRepeat = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M7 4.5h9.6c2 0 3.4 1.5 3.4 3.4v1.6h-2V7.9c0-.85-.6-1.4-1.4-1.4H7v2.1L3.2 6.05 7 3.45V4.5Z" fill="currentColor" />
    <path d="M17 19.5H7.4c-2 0-3.4-1.5-3.4-3.4v-1.6h2v1.6c0 .85.6 1.4 1.4 1.4H17v-2.1l3.8 2.55L17 20.55V19.5Z" fill="currentColor" />
  </svg>
)

export const IconRepeatOne = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M7 4.5h9.6c2 0 3.4 1.5 3.4 3.4v1.6h-2V7.9c0-.85-.6-1.4-1.4-1.4H7v2.1L3.2 6.05 7 3.45V4.5Z" fill="currentColor" />
    <path d="M17 19.5H7.4c-2 0-3.4-1.5-3.4-3.4v-1.6h2v1.6c0 .85.6 1.4 1.4 1.4H17v-2.1l3.8 2.55L17 20.55V19.5Z" fill="currentColor" />
    <text x="12" y="15.6" textAnchor="middle" fontSize="8.4" fontWeight="700" fill="currentColor">1</text>
  </svg>
)

export const IconVolume = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4 9.2h3.1L11.6 5.6c.6-.5 1.5-.07 1.5.72v11.36c0 .79-.9 1.22-1.5.72L7.1 14.8H4c-.55 0-1-.45-1-1V10.2c0-.55.45-1 1-1Z" fill="currentColor" />
    <path d="M16.2 8.6a5 5 0 0 1 0 6.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M18.5 6.2a8.4 8.4 0 0 1 0 11.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

export const IconVolumeMute = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4 9.2h3.1L11.6 5.6c.6-.5 1.5-.07 1.5.72v11.36c0 .79-.9 1.22-1.5.72L7.1 14.8H4c-.55 0-1-.45-1-1V10.2c0-.55.45-1 1-1Z" fill="currentColor" />
    <path d="m16.4 9.6 4.6 4.8M21 9.6l-4.6 4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/* ============ 导航 / 功能 ============ */

export const IconLibrary = ({ size = 20, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="3.2" y="4.4" width="4" height="15.2" rx="1.3" stroke="currentColor" strokeWidth={strokeWidth} />
    <rect x="9.6" y="4.4" width="4" height="15.2" rx="1.3" stroke="currentColor" strokeWidth={strokeWidth} />
    <path d="M16.6 5.6l3.9 1a1.3 1.3 0 0 1 .93 1.6l-2.6 10.6a1.3 1.3 0 0 1-1.57.95l-.3-.07" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
)

export const IconHeart = ({ size = 20, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path
      d="M12 20.2s-7.5-4.6-7.5-9.6a4.3 4.3 0 0 1 7.5-2.9 4.3 4.3 0 0 1 7.5 2.9c0 5-7.5 9.6-7.5 9.6Z"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </svg>
)

export const IconHeartFilled = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path
      d="M12 20.2s-7.5-4.6-7.5-9.6a4.3 4.3 0 0 1 7.5-2.9 4.3 4.3 0 0 1 7.5 2.9c0 5-7.5 9.6-7.5 9.6Z"
      fill="currentColor"
    />
  </svg>
)

export const IconList = ({ size = 20, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    <circle cx="4.4" cy="6.5" r="1.35" fill="currentColor" />
    <circle cx="4.4" cy="12" r="1.35" fill="currentColor" />
    <circle cx="4.4" cy="17.5" r="1.35" fill="currentColor" />
  </svg>
)

export const IconFolder = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path
      d="M3 7.4c0-1.1.9-2 2-2h3.6c.55 0 1.07.22 1.45.61l1.06 1.1H19c1.1 0 2 .9 2 2v7.5c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V7.4Z"
      fill="currentColor"
      opacity="0.92"
    />
  </svg>
)

export const IconMusic = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M9.2 17.4V6.9l9-1.9v9.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <ellipse cx="7" cy="17.6" rx="2.6" ry="2.2" fill="currentColor" />
    <ellipse cx="16" cy="15.4" rx="2.6" ry="2.2" fill="currentColor" />
  </svg>
)

export const IconDisc = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="2.6" fill="currentColor" />
  </svg>
)

export const IconLyrics = ({ size = 20, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4.5 5.5h15M4.5 10h11M4.5 14.5h15M4.5 19h8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
)

export const IconSliders = ({ size = 20, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M5 5v14M12 5v14M19 5v14" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    <circle cx="5" cy="9.5" r="2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="15" r="2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="8" r="2" fill="currentColor" stroke="none" />
  </svg>
)

export const IconSettings = ({ size = 20, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth={strokeWidth} />
    <path
      d="M12 2.8a1.4 1.4 0 0 1 1.36 1.05l.32 1.26c.55.16 1.07.4 1.55.7l1.2-.5a1.4 1.4 0 0 1 1.67.5l1.2 2.08a1.4 1.4 0 0 1-.26 1.74l-.94.86c.03.28.05.57.05.86s-.02.58-.05.86l.94.86c.48.44.58 1.16.26 1.74l-1.2 2.07a1.4 1.4 0 0 1-1.67.5l-1.2-.5c-.48.3-1 .54-1.55.7l-.32 1.26A1.4 1.4 0 0 1 12 21.2a1.4 1.4 0 0 1-1.36-1.05l-.32-1.26c-.55-.16-1.07-.4-1.55-.7l-1.2.5a1.4 1.4 0 0 1-1.67-.5l-1.2-2.07a1.4 1.4 0 0 1 .26-1.74l.94-.86A7.4 7.4 0 0 1 5.85 12c0-.29.02-.58.05-.86l-.94-.86a1.4 1.4 0 0 1-.26-1.74l1.2-2.08a1.4 1.4 0 0 1 1.67-.5l1.2.5c.48-.3 1-.54 1.55-.7l.32-1.26A1.4 1.4 0 0 1 12 2.8Z"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </svg>
)

export const IconSearch = ({ size = 18, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="10.8" cy="10.8" r="6.6" stroke="currentColor" strokeWidth={strokeWidth} />
    <path d="m15.8 15.8 4 4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
)

export const IconClose = ({ size = 18, className, style, strokeWidth = 2 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
)

export const IconPlus = ({ size = 18, className, style, strokeWidth = 2 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 5.5v13M5.5 12h13" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
)

export const IconChevronRight = ({ size = 16, className, style, strokeWidth = 2 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const IconChevronDown = ({ size = 16, className, style, strokeWidth = 2 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m5.5 9.5 6.5 6.5 6.5-6.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const IconArrowLeft = ({ size = 18, className, style, strokeWidth = 2 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M19 12H6M11 6l-6 6 6 6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const IconExpand = ({ size = 18, className, style, strokeWidth = 2 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const IconMonitor = ({ size = 18, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="3" y="4.5" width="18" height="12.5" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
    <path d="M9 20.5h6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
)

export const IconInfo = ({ size = 18, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth={strokeWidth} />
    <path d="M12 10.8v5.4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    <circle cx="12" cy="7.9" r="1.15" fill="currentColor" />
  </svg>
)

export const IconTrash = ({ size = 16, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4.8 6.6h14.4M9.5 6.6V5.2c0-.7.56-1.2 1.25-1.2h2.5c.69 0 1.25.5 1.25 1.2v1.4M6.6 6.6l.85 11.6c.05.75.68 1.3 1.43 1.3h6.24c.75 0 1.38-.55 1.43-1.3l.85-11.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const IconDrag = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="9" cy="6" r="1.4" fill="currentColor" />
    <circle cx="15" cy="6" r="1.4" fill="currentColor" />
    <circle cx="9" cy="12" r="1.4" fill="currentColor" />
    <circle cx="15" cy="12" r="1.4" fill="currentColor" />
    <circle cx="9" cy="18" r="1.4" fill="currentColor" />
    <circle cx="15" cy="18" r="1.4" fill="currentColor" />
  </svg>
)

export const IconNote = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="9.2" fill="currentColor" opacity="0.14" />
    <path d="M10.2 16.4V9.1l5.6-1.2v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <ellipse cx="8.8" cy="16.5" rx="1.7" ry="1.45" fill="currentColor" />
    <ellipse cx="14.4" cy="14.9" rx="1.7" ry="1.45" fill="currentColor" />
  </svg>
)

export const IconSparkle = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 3.5l1.7 4.9 4.9 1.7-4.9 1.7L12 16.7l-1.7-4.9L5.4 10.1l4.9-1.7L12 3.5Z" fill="currentColor" />
  </svg>
)

export const IconBullet = ({ size = 6, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="6" fill="currentColor" />
  </svg>
)

export const IconMore = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="5.6" cy="12" r="1.75" fill="currentColor" />
    <circle cx="12" cy="12" r="1.75" fill="currentColor" />
    <circle cx="18.4" cy="12" r="1.75" fill="currentColor" />
  </svg>
)

export const IconChevronUp = ({ size = 16, className, style, strokeWidth = 2 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m5.5 14.5 6.5-6.5 6.5 6.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const IconClock = ({ size = 18, className, style, strokeWidth = 1.8 }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth={strokeWidth} />
    <path d="M12 7.4V12l3.1 1.9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
