const http = require('http')
const https = require('https')

/**
 * Pull an Ollama model using the documented newline-delimited JSON stream.
 * The callback receives (percent|null, human-readable status). Null means the
 * server has not supplied byte totals yet; never invent a percentage.
 */
function pullOllamaModel(baseURL, model, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
        let url
        try {
            url = new URL('/api/pull', String(baseURL).replace(/\/+$/, '') + '/')
        } catch (error) {
            reject(new Error('Invalid Ollama URL: ' + error.message))
            return
        }
        const transport = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null
        if (!transport) {
            reject(new Error('Unsupported Ollama URL protocol: ' + url.protocol))
            return
        }

        let settled = false
        const finish = (error) => {
            if (settled) return
            settled = true
            if (error) reject(error)
            else resolve()
        }
        const request = transport.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }, (response) => {
            response.setEncoding('utf8')
            let buffer = ''
            let success = false
            let lastStatus = ''
            let serverError = ''

            const handleLine = (line) => {
                if (!line.trim() || settled) return
                let event
                try {
                    event = JSON.parse(line)
                } catch (_) {
                    serverError = 'Ollama sent invalid progress JSON'
                    finish(new Error(serverError))
                    request.destroy()
                    return
                }
                if (!event || typeof event !== 'object') return
                if (event.error) {
                    serverError = String(event.error)
                    finish(new Error('Ollama model pull failed: ' + serverError))
                    request.destroy()
                    return
                }
                if (typeof event.status === 'string') {
                    lastStatus = event.status
                    if (event.status.toLowerCase() === 'success') success = true
                }
                const total = event.total
                const completed = event.completed
                if (typeof total === 'number' && Number.isFinite(total) && total > 0 &&
                    typeof completed === 'number' && Number.isFinite(completed) && completed >= 0) {
                    const pct = Math.max(0, Math.min(100, Math.round(100 * completed / total)))
                    const mb = (completed / (1024 * 1024)).toFixed(1)
                    const totalMB = (total / (1024 * 1024)).toFixed(1)
                    onProgress(pct, model + ': ' + pct + '% (' + mb + ' / ' + totalMB + ' MB)')
                } else if (lastStatus) {
                    onProgress(null, model + ': ' + lastStatus)
                }
            }

            response.on('data', (chunk) => {
                if (settled) return
                buffer += chunk
                let end = buffer.indexOf('\n')
                while (end !== -1 && !settled) {
                    const line = buffer.slice(0, end)
                    buffer = buffer.slice(end + 1)
                    handleLine(line)
                    end = buffer.indexOf('\n')
                }
                if (buffer.length > 65536) {
                    finish(new Error('Ollama progress line exceeded limit'))
                    request.destroy()
                }
            })
            response.on('end', () => {
                if (buffer.trim()) handleLine(buffer)
                if (settled) return
                if (response.statusCode !== 200) {
                    finish(new Error('Ollama pull HTTP ' + response.statusCode +
                        (serverError || lastStatus ? ': ' + (serverError || lastStatus) : '')))
                } else if (!success) {
                    finish(new Error('Ollama model pull ended without a success status' +
                        (lastStatus ? ': ' + lastStatus : '')))
                } else {
                    finish()
                }
            })
            response.on('error', finish)
        })
        request.on('error', finish)
        request.end(JSON.stringify({ model, stream: true }))
    })
}

module.exports = { pullOllamaModel }
