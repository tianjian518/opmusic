import { CapacitorConfig } from '@capacitor/cli'

// Capacitor 配置：把已构建的 dist/ 当作 WebView 内容。
// 出包步骤见 BUILD-APK.md（本机无 Android SDK，无法在此直接出包）。
const config: CapacitorConfig = {
  appId: 'com.tianjian.music',
  appName: '天剑音乐播放器',
  webDir: 'dist',
  server: {
    // 安卓用 https scheme 的本地服务，避免混合内容限制
    androidScheme: 'https'
  },
  plugins: {}
}

export default config
