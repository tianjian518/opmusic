package com.tianjian.music

import com.getcapacitor.CapacitorPlugin
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.JSObject
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap

/**
 * OpMusic —— 安卓原生插件
 *
 * 作用（等价桌面端 streamServer.ts + meta.ts，但跑在 App 内）：
 *  1) 在 App 内起一个 127.0.0.1 本地 HTTP 代理，处理 /stream /cover /lyrics，
 *     按账号凭据转发到 WebDAV，支持 Range（绕过浏览器 CORS / 跨域媒体限制）。
 *  2) 暴露 metaInfo / onlineLyrics 桥接方法，用原生 HttpURLConnection 抓取
 *     MusicBrainz / Cover Art Archive / Wikipedia / 歌词源（同样避免 CORS）。
 *
 * 注意：本文件需放在 Capacitor 安卓工程的
 *   android/app/src/main/java/com/tianjian/music/TianjianPlugin.kt
 * 并在 MainActivity 注册（见 BUILD-APK.md）。在本仓库沙箱无法编译，需在你本机出包。
 */
@CapacitorPlugin(name = "OpMusic")
class TianjianPlugin : Plugin() {

    data class Acc(val url: String, val user: String, val pass: String)

    private val accounts = ConcurrentHashMap<String, Acc>()
    private val PORT = 18150

    override fun load() {
        super.load()
        startProxy()
    }

    // ---- 账号：由 Web 端 store 变更时同步过来 ----
    @PluginMethod
    fun setAccounts(call: PluginCall) {
        val arr = call.getArray("accounts")
        accounts.clear()
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val id = o.optString("id")
                if (id.isNotEmpty()) {
                    accounts[id] = Acc(
                        o.optString("url"),
                        o.optString("username"),
                        o.optString("password")
                    )
                }
            }
        }
        call.resolve()
    }

    // ---- 歌手/专辑信息（MusicBrainz + Wikipedia） ----
    @PluginMethod
    fun metaInfo(call: PluginCall) {
        val artist = call.getString("artist") ?: ""
        val album = call.getString("album") ?: ""
        val out = JSObject()
        try {
            if (artist.isNotEmpty()) {
                val aUrl = "https://musicbrainz.org/ws/2/artist/?query=${enc("artist:$artist")}&fmt=json&limit=1"
                val aJson = getJson(aUrl)
                val mbArtist = aJson?.optJSONArray("artists")?.optJSONObject(0)
                if (mbArtist != null) {
                    val det = getJson("https://musicbrainz.org/ws/2/artist/${mbArtist.optString("id")}?inc=url-rels&fmt=json")
                    val wiki = det?.optJSONArray("relations")?.let { rels ->
                        (0 until rels.length()).firstNotNullOfOrNull { i ->
                            val r = rels.optJSONObject(i)
                            if (r.optString("type") == "wikipedia") r.optJSONObject("url")?.optString("resource") else null
                        }
                    }
                    val wt = wiki?.split("/wiki/")?.getOrNull(1)
                    if (wt != null) {
                        val title = wt.substringAfterLast("/")
                        var sum = getJson("https://zh.wikipedia.org/api/rest_v1/page/summary/${enc(title)}")
                        if (sum?.optString("extract").isNullOrEmpty())
                            sum = getJson("https://en.wikipedia.org/api/rest_v1/page/summary/${enc(title)}")
                        out.put("artistBio", sum?.optString("extract", ""))
                    }
                }
            }
            if (album.isNotEmpty()) {
                val queries = if (artist.isNotEmpty()) listOf("release:$album AND artist:$artist", "release:$album")
                else listOf("release:$album")
                for (q in queries) {
                    val rel = getJson("https://musicbrainz.org/ws/2/release/?query=${enc(q)}&fmt=json&limit=1")
                        ?.optJSONArray("releases")?.optJSONObject(0)
                    if (rel != null) {
                        out.put("albumName", rel.optString("title"))
                        out.put("albumYear", rel.optString("date").take(4))
                        break
                    }
                }
            }
        } catch (_: Exception) {
        }
        call.resolve(out)
    }

    // ---- 在线歌词（多源轮询） ----
    @PluginMethod
    fun onlineLyrics(call: PluginCall): Unit {
        val artist = call.getString("artist") ?: ""
        val title = call.getString("title") ?: ""
        val combos = if (artist.isNotEmpty()) listOf(Pair(artist, title), Pair("", title)) else listOf(Pair("", title))
        for ((a, t) in combos) {
            // lrclib（返回顶层 JSON 数组）
            val lrclibTxt = getText("https://lrclib.net/api/search?artist=${enc(a)}&track=${enc(t)}")
            val lrclibList = if (lrclibTxt != null) { try { JSONArray(lrclibTxt) } catch (_: Exception) { null } } else null
            if (lrclibList != null && lrclibList.length() > 0) {
                val w = (0 until lrclibList.length()).firstNotNullOfOrNull { i ->
                    val x = lrclibList.optJSONObject(i)
                    x.optString("syncedLyrics").ifEmpty { x.optString("plainLyrics") }.ifEmpty { null }
                }
                if (w != null) { call.resolve(JSObject().apply { put("lyrics", w) }); return }
            }
            // lyrics.ovh
            if (a.isNotEmpty()) {
                val ovh = getJson("https://api.lyrics.ovh/v1/${enc(a)}/${enc(t)}")
                val ovhL = ovh?.optString("lyrics", "")?.takeIf { it.isNotEmpty() }
                if (ovhL != null) { call.resolve(JSObject().apply { put("lyrics", ovhL) }); return }
            }
            // gecimi
            val gUrl = if (a.isNotEmpty()) "https://gecimi.com/api/lyric/${enc(t)}/${enc(a)}" else "https://gecimi.com/api/lyric/${enc(t)}"
            val g = getJson(gUrl)?.optJSONArray("result")
            val gL = if (g != null && g.length() > 0) getText(g.optJSONObject(0).optString("lrc")) else null
            if (!gL.isNullOrEmpty()) { call.resolve(JSObject().apply { put("lyrics", gL) }); return }
        }
        call.resolve(JSObject()) // 未找到
    }

    // ===================== 本地流代理 =====================
    private fun startProxy() {
        Thread {
            try {
                val server = ServerSocket(PORT)
                val base = "http://127.0.0.1:$PORT"
                getActivity().runOnUiThread {
                    bridge.webView.evaluateJavascript("window.__TIANJIAN_STREAM_BASE__='$base';", null)
                }
                while (true) {
                    val sock = server.accept()
                    Thread { handle(sock) }.start()
                }
            } catch (_: Exception) {
            }
        }.start()
    }

    private fun handle(sock: Socket) {
        try {
            val `in` = BufferedInputStream(sock.getInputStream())
            val out = BufferedOutputStream(sock.getOutputStream())
            val reqLine = readLine(`in`) ?: return
            val parts = reqLine.split(" ")
            if (parts.size < 2 || !parts[0].startsWith("GET")) return
            val uri = parts[1]
            val q = uri.substringAfter('?', "")
            val params = parseQuery(q)
            val range = readHeaders(`in`)

            when (uri.substringBefore('?')) {
                "/stream" -> proxyWebdav(params["acct"], params["path"], range, out, "audio/*")
                "/cover" -> serveCover(params, range, out)
                "/lyrics" -> serveLyrics(params, out)
                else -> sendStatus(out, 404, "text/plain", "not found")
            }
        } catch (_: Exception) {
        } finally {
            try { sock.close() } catch (_: Exception) {}
        }
    }

    private fun proxyWebdav(acctId: String?, path: String?, range: String?, out: OutputStream, contentType: String) {
        val acc = if (acctId != null) accounts[acctId] else null
        if (acc == null || path == null) { sendStatus(out, 404, "text/plain", "no account/path"); return }
        try {
            val url = URL(acc.url.removeSuffix("/") + path)
            val conn = url.openConnection() as HttpURLConnection
            conn.setRequestProperty("Authorization", basic(acc.user, acc.pass))
            conn.setRequestProperty("User-Agent", "TianjianMusicPlayer/1.0")
            if (!range.isNullOrEmpty()) conn.setRequestProperty("Range", range)
            conn.connect()
            val code = conn.responseCode
            val cType = conn.contentType ?: contentType
            val len = conn.contentLengthLong
            val `in` = if (code == 200) conn.inputStream else conn.errorStream
            if (code == 206) {
                val cr = conn.getHeaderField("Content-Range")
                writeHeaders(out, "HTTP/1.1 206 Partial Content", mapOf(
                    "Content-Type" to cType,
                    "Accept-Ranges" to "bytes",
                    "Content-Range" to (cr ?: ""),
                    "Content-Length" to (len.toString())
                ))
            } else {
                writeHeaders(out, if (code == 200) "HTTP/1.1 200 OK" else "HTTP/1.1 $code", mapOf(
                    "Content-Type" to cType,
                    "Accept-Ranges" to "bytes",
                    "Content-Length" to (if (len >= 0) len.toString() else "*")
                ))
            }
            `in`?.copyTo(out)
            out.flush()
        } catch (e: Exception) {
            sendStatus(out, 500, "text/plain", e.message ?: "proxy error")
        }
    }

    private fun serveCover(params: Map<String, String>, range: String?, out: OutputStream) {
        val acctId = params["acct"]
        val dir = params["path"] ?: ""
        val acc = if (acctId != null) accounts[acctId] else null
        if (acc == null) { sendStatus(out, 404, "text/plain", "no account"); return }
        // 1) 先试目录下的本地封面
        for (name in listOf("cover.jpg", "cover.png", "folder.jpg", "folder.png",
            "${dir.substringAfterLast('/')}.jpg", "${dir.substringAfterLast('/')}.png")) {
            val p = if (dir.endsWith("/")) dir + name else "$dir/$name"
            val data = fetchBytes(acc, p)
            if (data != null) { writeBytes(out, data, "image/jpeg"); return }
        }
        // 2) 在线封面（MusicBrainz + Cover Art Archive）
        val artist = params["artist"] ?: ""
        val album = params["album"] ?: ""
        if (artist.isNotEmpty() || album.isNotEmpty()) {
            val q = buildList {
                if (artist.isNotEmpty() && album.isNotEmpty()) add("release:$album AND artist:$artist")
                if (album.isNotEmpty()) add("release:$album")
                if (artist.isNotEmpty()) add("artist:$artist")
            }
            for (query in q) {
                val rel = getJson("https://musicbrainz.org/ws/2/release/?query=${enc(query)}&fmt=json&limit=1")
                    ?.optJSONArray("releases")?.optJSONObject(0)
                if (rel != null) {
                    val bytes = fetchBytesDirect("https://coverartarchive.org/release/${rel.optString("id")}/front")
                    if (bytes != null) { writeBytes(out, bytes, "image/jpeg"); return }
                }
            }
        }
        sendStatus(out, 404, "text/plain", "no cover")
    }

    private fun serveLyrics(params: Map<String, String>, out: OutputStream) {
        val acctId = params["acct"]
        val path = params["path"] ?: ""
        val acc = if (acctId != null) accounts[acctId] else null
        if (acc == null) { sendStatus(out, 404, "text/plain", "no account"); return }
        val lrcPath = path.removeSuffix(".flac").removeSuffix(".mp3").removeSuffix(".wav")
            .removeSuffix(".ogg").removeSuffix(".m4a").removeSuffix(".aac").removeSuffix(".opus")
            .removeSuffix(".ape").removeSuffix(".wma") + ".lrc"
        val data = fetchBytes(acc, lrcPath)
        if (data != null) writeBytes(out, data, "text/plain; charset=utf-8")
        else sendStatus(out, 404, "text/plain", "no lyrics")
    }

    // ---- 工具 ----
    private fun fetchBytes(acc: Acc, path: String): ByteArray? {
        return try {
            val url = URL(acc.url.removeSuffix("/") + path)
            val conn = url.openConnection() as HttpURLConnection
            conn.setRequestProperty("Authorization", basic(acc.user, acc.pass))
            conn.connect()
            if (conn.responseCode == 200) conn.inputStream.readBytes() else null
        } catch (_: Exception) { null }
    }

    private fun fetchBytesDirect(urlStr: String): ByteArray? {
        return try {
            val conn = URL(urlStr).openConnection() as HttpURLConnection
            conn.setRequestProperty("User-Agent", "TianjianMusicPlayer/1.0")
            conn.connect()
            if (conn.responseCode == 200) conn.inputStream.readBytes() else null
        } catch (_: Exception) { null }
    }

    private fun getJson(urlStr: String): org.json.JSONObject? {
        val txt = getText(urlStr) ?: return null
        return try { org.json.JSONObject(txt) } catch (_: Exception) { null }
    }
    private fun getText(urlStr: String): String? {
        return try {
            val conn = URL(urlStr).openConnection() as HttpURLConnection
            conn.setRequestProperty("User-Agent", "TianjianMusicPlayer/1.0")
            conn.setRequestProperty("Accept", "application/json")
            conn.connect()
            if (conn.responseCode == 200) conn.inputStream.bufferedReader().use { it.readText() } else null
        } catch (_: Exception) { null }
    }

    private fun basic(user: String, pass: String): String {
        val s = "$user:$pass"
        return "Basic " + Base64.getEncoder().encodeToString(s.toByteArray(StandardCharsets.UTF_8))
    }
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    // ---- 极简 HTTP 响应辅助 ----
    private fun readLine(`in`: BufferedInputStream): String? {
        val sb = StringBuilder()
        var c: Int
        while (`in`.read().also { c = it } != -1) {
            if (c == '\n'.code) break
            if (c != '\r'.code) sb.append(c.toChar())
        }
        return if (sb.isEmpty()) null else sb.toString()
    }
    private fun readHeaders(`in`: BufferedInputStream): String? {
        var range: String? = null
        var line: String?
        while (readLine(`in`).also { line = it } != null) {
            if (line!!.isEmpty()) break
            if (line!!.startsWith("Range:", ignoreCase = true)) range = line!!.substringAfter(':').trim()
        }
        return range
    }
    private fun parseQuery(q: String): Map<String, String> {
        val map = mutableMapOf<String, String>()
        q.split("&").forEach {
            val kv = it.split("=")
            if (kv.size == 2) map[decode(kv[0])] = decode(kv[1])
        }
        return map
    }
    private fun decode(s: String) = try { java.net.URLDecoder.decode(s, "UTF-8") } catch (_: Exception) { s }

    private fun writeHeaders(out: OutputStream, status: String, headers: Map<String, String>) {
        val sb = StringBuilder()
        sb.append(status).append("\r\n")
        headers.forEach { (k, v) -> if (v.isNotEmpty()) sb.append("$k: $v\r\n") }
        sb.append("\r\n")
        out.write(sb.toString().toByteArray(StandardCharsets.UTF_8))
    }
    private fun writeBytes(out: OutputStream, data: ByteArray, contentType: String) {
        writeHeaders(out, "HTTP/1.1 200 OK", mapOf(
            "Content-Type" to contentType,
            "Content-Length" to data.size.toString(),
            "Cache-Control" to "no-store"
        ))
        out.write(data)
        out.flush()
    }
    private fun sendStatus(out: OutputStream, code: Int, contentType: String, msg: String) {
        writeHeaders(out, "HTTP/1.1 $code", mapOf("Content-Type" to contentType, "Content-Length" to msg.toByteArray().size.toString()))
        out.write(msg.toByteArray(StandardCharsets.UTF_8))
        out.flush()
    }
}
