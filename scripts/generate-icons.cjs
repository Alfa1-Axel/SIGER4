// Genera los PNG de icono PWA (siger4-192.png, siger4-512.png) sin dependencias externas,
// dibujando un cuadrado rojo institucional con una llama blanca simple, usando zlib nativo de Node.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = []
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

// Llama estilizada simple, aproximada con circulos/elipses superpuestas.
function isFlame(nx, ny) {
  // nx, ny en rango 0..1
  const cx = 0.5
  const bodyTop = { cx, cy: 0.62, r: 0.2 }
  const bodyMid = { cx, cy: 0.45, r: 0.16 }
  const tip = { cx, cy: 0.28, r: 0.08 }
  return (
    inCircle(nx, ny, bodyTop.cx, bodyTop.cy, bodyTop.r) ||
    inCircle(nx, ny, bodyMid.cx, bodyMid.cy, bodyMid.r) ||
    inCircle(nx, ny, tip.cx, tip.cy, tip.r)
  )
}

function generatePng(size, outPath) {
  const radius = size * 0.18 // esquinas redondeadas
  const raw = Buffer.alloc((size * 4 + 1) * size)

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4

      // Rounded-rect mask for the red background.
      let insideRounded = true
      const corners = [
        { cx: radius, cy: radius },
        { cx: size - radius, cy: radius },
        { cx: radius, cy: size - radius },
        { cx: size - radius, cy: size - radius },
      ]
      for (const c of corners) {
        const inCornerBox =
          (c.cx === radius ? x < radius : x >= size - radius) &&
          (c.cy === radius ? y < radius : y >= size - radius)
        if (inCornerBox && !inCircle(x, y, c.cx, c.cy, radius)) {
          insideRounded = false
          break
        }
      }

      if (!insideRounded) {
        raw[idx] = 0
        raw[idx + 1] = 0
        raw[idx + 2] = 0
        raw[idx + 3] = 0 // transparent outside rounded rect
        continue
      }

      const nx = x / size
      const ny = y / size

      if (isFlame(nx, ny)) {
        raw[idx] = 0xff
        raw[idx + 1] = 0xff
        raw[idx + 2] = 0xff
        raw[idx + 3] = 0xff
      } else {
        raw[idx] = 0xd3
        raw[idx + 1] = 0x2f
        raw[idx + 2] = 0x2f
        raw[idx + 3] = 0xff
      }
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = zlib.deflateSync(raw)

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])

  fs.writeFileSync(outPath, png)
  console.log(`Generado ${outPath} (${size}x${size})`)
}

const outDir = path.join(__dirname, '..', 'public', 'icons')
generatePng(192, path.join(outDir, 'siger4-192.png'))
generatePng(512, path.join(outDir, 'siger4-512.png'))
