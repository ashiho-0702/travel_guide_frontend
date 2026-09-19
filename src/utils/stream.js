// SSE（text/event-stream）解析器
// 后端 v1.0：事件按空行分隔，事件内是 id:/event:/data: 三种行
// 关键点（文档 8.3）：网络分块会切断 UTF-8 中文（一个汉字 3 字节），
// 必须在字节层面攒到换行再整行解码；只有完整的 data 才能进 JSON.parse
function decodeUtf8(bytes) {
  let out = ''
  let i = 0
  const n = bytes.length
  while (i < n) {
    const b = bytes[i]
    if (b < 0x80) {
      out += String.fromCharCode(b)
      i += 1
    } else if (b >= 0xc0 && b < 0xe0 && i + 1 < n) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
      i += 2
    } else if (b >= 0xe0 && b < 0xf0 && i + 2 < n) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
      )
      i += 3
    } else if (b >= 0xf0 && i + 3 < n) {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f)
      const v = cp - 0x10000
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff))
      i += 4
    } else {
      i += 1 // 跨包残留的不完整字节，等下一块补齐
    }
  }
  return out
}

function toBytes(buf) {
  if (!buf) return new Uint8Array(0)
  if (buf instanceof Uint8Array) return buf
  return new Uint8Array(buf)
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

// 返回 { push(ArrayBuffer), reset(), lastEventId }
// onEvent({ id, event, data })——data 已 JSON.parse，解析失败时 data 为原始字符串
function createSseParser(onEvent) {
  let buf = new Uint8Array(0)
  let lines = []        // 当前事件攒到的行（原始字节）
  let lineBytes = []    // 当前行攒到的字节（中文可能被切块切断）
  let lastId = ''

  function finishLine() {
    if (lineBytes.length) {
      lines.push(decodeUtf8(new Uint8Array(lineBytes)))
      lineBytes = []
    }
  }

  function finishEvent() {
    finishLine()
    if (!lines.length) return
    let id = lastId
    let type = 'message'
    let dataText = ''
    lines.forEach(line => {
      if (line.indexOf('id:') === 0) id = line.slice(3).trim()
      else if (line.indexOf('event:') === 0) type = line.slice(6).trim()
      else if (line.indexOf('data:') === 0) {
        if (dataText) dataText += '\n'
        dataText += line.slice(5).trim()
      }
      // 其他行（注释、未知字段）按规范忽略
    })
    lines = []
    if (!dataText) return // 纯心跳空壳直接丢弃
    let data = dataText
    try {
      data = JSON.parse(dataText)
    } catch (e) {
      console.warn('[stream] 事件 data 不是合法 JSON：', dataText)
    }
    lastId = id
    onEvent({ id, event: type, data })
  }

  function push(chunk) {
    buf = concat(buf, toBytes(chunk))
    let prevNewline = false
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i]
      if (b === 0x0d) continue // 忽略 \r
      if (b === 0x0a) {
        finishLine()
        // 连续两个换行 = 一个事件结束（跨块也不丢：prevNewline 是状态不是字节）
        if (prevNewline) finishEvent()
        prevNewline = true
      } else {
        prevNewline = false
        lineBytes.push(b)
      }
    }
    buf = new Uint8Array(0) // 字节已全部落到 lineBytes/lines，缓冲清空
  }

  function reset() {
    buf = new Uint8Array(0)
    lines = []
    lineBytes = []
  }

  return { push, reset, get lastEventId() { return lastId } }
}

export { createSseParser, decodeUtf8 }
