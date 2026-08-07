# 打包安卓 APK（OpMusic）

本仓库代码已改造为「环境无关」：同一套 React 前端在 **桌面 Electron / 浏览器 PWA / 安卓 Capacitor** 下通用。
- 桌面与 PWA 已可在本仓库直接构建验证。
- **安卓 APK 必须在本机（装有 Android SDK + 网络）出包**，本沙箱无 SDK 无法代出。

最终 APK 里，播放/封面/歌词的「大脑」由 `capacitor/android/TianjianPlugin.kt`（应用内本地代理 + 原生抓取）提供，完全绕过浏览器 CORS。

---

## 一、前置依赖（本机）
- Node 20+、npm
- **Java 17**（Capacitor 6 要求）
- **Android SDK**：`cmdline-tools` + `platforms;android-34` + `build-tools;34.0.0`
- 设置环境变量：`export ANDROID_HOME=$HOME/Android/Sdk && export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools`
- 接受协议：`yes | sdkmanager --licenses`
- 手机端：WebDAV 地址必须是手机能访问的（云端/NAS/公网），**不要用 `127.0.0.1`**。

## 二、初始化 Capacitor（项目根目录）
```bash
npm install
npm i -D @capacitor/cli @capacitor/core @capacitor/android
npx cap init com.tianjian.music "OpMusic" --web-dir dist
npx cap add android        # 生成 android/ 工程
```

## 三、加入原生插件（本地流代理 + 刮削）
推荐用标准插件包方式（会自动生成 Web 端桥接 `Capacitor.Plugins.OpMusic`，前端代码已调用它）：

```bash
# 另建一个临时插件工程
npm init @capacitor/plugin@latest capacitor-tianjian   # 按提示填 name=capacitor-tianjian
# 用本仓库的 Kotlin 覆盖插件的安卓实现
cp capacitor/android/TianjianPlugin.kt \
   capacitor-tianjian/android/src/main/java/com/tianjian/music/TianjianPlugin.kt
# 包名/目录以插件脚手架实际生成的结构为准；如不同请改 package 与路径
# 回到主工程引用本地插件
npm i ../capacitor-tianjian
npx cap sync android
```

> 备选（不建插件包）：把 `TianjianPlugin.kt` 直接放到
> `android/app/src/main/java/com/tianjian/music/TianjianPlugin.kt`，
> 并在 `android/app/src/main/java/com/tianjian/music/MainActivity.java` 的 `onCreate` 里注册：
> ```java
> this.init(savedInstanceState, new ArrayList<Class<? extends Plugin>>() {{
>   add(TianjianPlugin.class);
> }});
> ```
> 同时需要一段 Web 桥接（在 main.tsx 里，当 `window.Capacitor` 存在时）：
> `import { registerPlugin } from '@capacitor/core'; (window as any).Capacitor.Plugins.OpMusic = registerPlugin('OpMusic')`

## 四、允许明文流量（WebDAV 多为 http）
编辑 `android/app/src/main/AndroidManifest.xml`，在 `<application>` 加：
```xml
android:usesCleartextTraffic="true"
```
（仅本地 `127.0.0.1` 代理默认允许；外部 http WebDAV 需要此项）

## 五、签名并出包
```bash
cd android
keytool -genkeypair -v -keystore ../tianjian-release.keystore -alias tianjian \
        -keyalg RSA -keysize 2048 -validity 10000
```
在 `android/app/build.gradle` 的 `android {}` 内加：
```groovy
signingConfigs {
    release { storeFile file('../tianjian-release.keystore'); storePassword '你的密码'; keyAlias 'tianjian'; keyPassword '你的密码' }
}
buildTypes { release { signingConfig signingConfigs.release; minifyEnabled false } }
```
然后构建：
```bash
./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
```
安装到手机：`adb install android/app/build/outputs/apk/release/app-release.apk`，或把 apk 传到手机点击安装。

## 六、验证清单
1. 手机装好后打开 → 侧栏「音乐库」添加你的 WebDAV 账号（填云端/NAS 地址，不是 127.0.0.1）。
2. 浏览目录、播放一首歌 → 应自动进入全屏播放页，唱片盘转动、歌词滚动。
3. 点「获取在线歌词 / 重新获取」→ 经原生插件抓取（lrclib / gecimi 等）。
4. 若播放无声：多为 WebDAV 服务器不支持 Range 或有防盗链，检查服务器设置；原生代理已按 Range 转发。

## 七、零 SDK 的替代方案（PWA）
若暂时不想配 Android SDK，可直接用 PWA：本仓库 `npm run build` 后，`dist/` 下已有 `manifest.webmanifest` + `sw.js` + `icon.svg`。
用任意静态服务器（需 https 或 localhost）托管 `dist/`，安卓 Chrome 打开 →「添加到主屏幕」即可当 App 安装。
也可把该 PWA 丢给 https://www.pwabuilder.com 一键生成 APK（背后原理同 Capacitor，但省去本地 SDK）。
PWA 方式下，流媒体走浏览器直连 WebDAV，依赖服务器允许 CORS + Range；若服务器限制严格，仍建议走上面的原生代理 APK。
