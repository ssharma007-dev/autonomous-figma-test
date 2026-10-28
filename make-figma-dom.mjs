#!/usr/bin/env node
// Builds a "Figma DOM wrapper" page for one Figma frame:
//   - visual layer: the frame exported as PNG at 1x (pixel-identical to the design)
//   - DOM layer: one invisible, absolutely positioned element per Figma node,
//     at the node's exact position and size, with real text for TEXT nodes
// so that Eyes captures the design's element structure along with the screenshot.
//
// Usage: node make-figma-dom.mjs <figma frame URL with node-id> <output dir>
// Token: FIGMA_TOKEN env var, or ~/.figma_token (scope file_content:read)
import fs from 'fs'
import os from 'os'
import path from 'path'

const [figmaUrl, outDir] = process.argv.slice(2)
if (!figmaUrl || !outDir) {
  console.error('Usage: node make-figma-dom.mjs <figma frame URL> <output dir>')
  process.exit(1)
}

const token = process.env.FIGMA_TOKEN || fs.readFileSync(path.join(os.homedir(), '.figma_token'), 'utf8').trim()
const fileKey = figmaUrl.match(/figma\.com\/(?:design|file|proto)\/([^/?]+)/)?.[1]
const nodeId = figmaUrl.match(/[?&]node-id=(\d+)[-:%3A]+(\d+)/i)?.slice(1, 3).join(':')
if (!fileKey || !nodeId) throw new Error('Could not read file key and node-id from the Figma URL')

async function figma(apiPath) {
  const res = await fetch(`https://api.figma.com/v1/${apiPath}`, { headers: { 'X-Figma-Token': token } })
  if (!res.ok) throw new Error(`Figma API ${apiPath}: ${res.status} ${res.statusText}`)
  return res.json()
}

const [nodesResp, imagesResp] = await Promise.all([
  figma(`files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`),
  figma(`images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`),
])
const root = nodesResp.nodes?.[nodeId]?.document
if (!root) throw new Error(`Node ${nodeId} not found in file ${fileKey}`)
const imageUrl = imagesResp.images?.[nodeId]
if (!imageUrl) throw new Error(`Figma returned no image for ${nodeId}`)

fs.mkdirSync(outDir, { recursive: true })
const png = Buffer.from(await (await fetch(imageUrl)).arrayBuffer())
fs.writeFileSync(path.join(outDir, 'design.png'), png)
fs.writeFileSync(path.join(outDir, 'figma-nodes.json'), JSON.stringify(nodesResp, null, 2))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const px = (n) => `${Math.round(n * 100) / 100}px`

// Figma node types mapped to tags that read naturally in a DOM
function tagFor(node) {
  if (node.type === 'TEXT') return (node.style?.fontSize ?? 0) >= 32 ? 'h2' : 'p'
  if (/button/i.test(node.name)) return 'button'
  return 'div'
}

let count = 0
// Children are positioned relative to their parent, so the DOM keeps the Figma hierarchy
function render(node, parentBox, depth) {
  if (node.visible === false) return ''
  const box = node.absoluteBoundingBox
  if (!box) return ''
  count++
  const tag = tagFor(node)
  const style = [
    'position:absolute',
    `left:${px(box.x - parentBox.x)}`,
    `top:${px(box.y - parentBox.y)}`,
    `width:${px(box.width)}`,
    `height:${px(box.height)}`,
  ]
  if (node.type === 'TEXT' && node.style) {
    style.push(`font-family:'${node.style.fontFamily}'`, `font-size:${px(node.style.fontSize)}`, `font-weight:${node.style.fontWeight}`)
  }
  const attrs = `class="fg" data-figma-id="${esc(node.id)}" data-figma-type="${node.type}" data-figma-name="${esc(node.name)}" style="${style.join(';')}"`
  const indent = '  '.repeat(depth)
  const inner = node.type === 'TEXT'
    ? esc(node.characters ?? '')
    : (node.children ?? []).map((c) => render(c, box, depth + 1)).join('')
  return node.type === 'TEXT'
    ? `\n${indent}<${tag} ${attrs}>${inner}</${tag}>`
    : `\n${indent}<${tag} ${attrs}>${inner}\n${indent}</${tag}>`
}

const rootBox = root.absoluteBoundingBox
const domLayer = render(root, rootBox, 2)

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(root.name)} (Figma design + DOM)</title>
<style>
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  .design { position: relative; width: ${px(rootBox.width)}; height: ${px(rootBox.height)}; }
  .design > img { position: absolute; left: 0; top: 0; display: block; }
  /* DOM layer: real positions, sizes and text from Figma, drawn invisibly over the image */
  .fg { margin: 0; padding: 0; border: 0; background: transparent; color: transparent;
        overflow: hidden; white-space: pre-wrap; line-height: 1.4; box-sizing: border-box; pointer-events: none; }
</style>
</head>
<body>
  <!-- Generated from Figma file ${esc(fileKey)}, node ${esc(nodeId)}, version ${esc(nodesResp.version ?? '')} (${count} nodes) -->
  <div class="design">
    <img src="design.png" width="${Math.round(rootBox.width)}" height="${Math.round(rootBox.height)}" alt="${esc(root.name)}">${domLayer}
  </div>
</body>
</html>
`
fs.writeFileSync(path.join(outDir, 'index.html'), html)
console.log(`Wrote ${path.join(outDir, 'index.html')}: ${count} Figma nodes, image ${Math.round(rootBox.width)}x${Math.round(rootBox.height)}`)
