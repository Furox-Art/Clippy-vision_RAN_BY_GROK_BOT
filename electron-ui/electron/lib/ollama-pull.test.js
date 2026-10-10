const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { after, before, test } = require('node:test')
const { pullOllamaModel } = require('./ollama-pull')

let server
let origin
before(async () => {
    server = createServer(async (req, res) => {
        assert.equal(req.url, '/api/pull')
        assert.equal(req.method, 'POST')
        let body = ''
        for await (const chunk of req) body += chunk
        const data = JSON.parse(body)
        assert.equal(data.stream, true)
        assert.equal(data.model, 'qwen3:8b')
        res.setHeader('Content-Type', 'application/x-ndjson')

        if (req.headers['x-test-case'] === 'unused') throw new Error('Unexpected header')
        if (data.model === 'qwen3:8b') {
            // One line split across chunks, then a complete line.
            res.write('{"status":"downloading","total":10485760,"completed":')
            res.write('5242880}\n')
            res.write('{"status":"downloading","total":10485760,"completed":10485760}\n')
            res.end('{"status":"success"}\n')
        }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = 'http://127.0.0.1:' + server.address().port
})
after(async () => {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
})

test('parses split NDJSON frames and reports actual downloaded/total MB', async () => {
    const updates = []
    await pullOllamaModel(origin, 'qwen3:8b', (percent, message) => {
        updates.push({ percent, message })
    })
    assert.ok(updates.some(x => x.percent === 50 && x.message.includes('5.0 / 10.0 MB')))
    assert.ok(updates.some(x => x.percent === 100))
})

test('surfaces a descriptive error from the Ollama stream', async () => {
    const local = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        res.end('{"error":"not enough space"}\n')
    })
    await new Promise(resolve => local.listen(0, '127.0.0.1', resolve))
    try {
        await assert.rejects(
            pullOllamaModel('http://127.0.0.1:' + local.address().port, 'qwen3:8b'),
            /not enough space/,
        )
    } finally {
        await new Promise(resolve => local.close(resolve))
    }
})

test('rejects truncated pull without explicit success', async () => {
    const local = createServer((req, res) => res.end('{"status":"downloading","total":10,"completed":5}\n'))
    await new Promise(resolve => local.listen(0, '127.0.0.1', resolve))
    try {
        await assert.rejects(
            pullOllamaModel('http://127.0.0.1:' + local.address().port, 'qwen3:8b'),
            /without a success status/,
        )
    } finally {
        await new Promise(resolve => local.close(resolve))
    }
})
