const form = document.getElementById('deploy-form')
const gitURLInput = document.getElementById('gitURL')
const slugInput = document.getElementById('slug')
const deployBtn = document.getElementById('deploy-btn')
const errorEl = document.getElementById('error')
const deploymentEl = document.getElementById('deployment')
const statusEl = document.getElementById('status')
const projectEl = document.getElementById('project')
const visitEl = document.getElementById('visit')
const logsEl = document.getElementById('logs')

const STATUS_LABELS = { queued: 'Queued', building: 'Building', done: 'Deployed', error: 'Failed' }

const socket = io(window.SOCKET_URL)

function setStatus(status) {
    statusEl.textContent = STATUS_LABELS[status]
    statusEl.className = `status status-${status}`

    const busy = status === 'queued' || status === 'building'
    deployBtn.disabled = busy
    deployBtn.textContent = busy ? 'Deploying…' : 'Deploy'
    gitURLInput.disabled = busy
    slugInput.disabled = busy
}

function addLog(text) {
    const line = document.createElement('div')
    line.className = text.startsWith('error:') ? 'log-line log-error' : 'log-line'
    line.textContent = text
    logsEl.appendChild(line)
    logsEl.scrollTop = logsEl.scrollHeight
}

socket.on('message', (message) => {
    if (message.startsWith('Joined')) return

    let text = message
    try {
        text = JSON.parse(message).log
    } catch {
        // plain string message
    }

    if (text.startsWith('Build Started')) {
        logsEl.innerHTML = ''
        setStatus('building')
    }
    if (text === 'Done') {
        setStatus('done')
        visitEl.classList.remove('hidden')
    }

    addLog(text)
})

slugInput.addEventListener('input', () => {
    slugInput.value = slugInput.value.toLowerCase()
})

form.addEventListener('submit', async (e) => {
    e.preventDefault()

    errorEl.textContent = ''
    logsEl.innerHTML = '<div class="log-line muted">Waiting for build container to start…</div>'
    visitEl.classList.add('hidden')
    projectEl.textContent = ''
    deploymentEl.classList.remove('hidden')
    setStatus('queued')

    try {
        const res = await fetch('/project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gitURL: gitURLInput.value.trim(), slug: slugInput.value || undefined })
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Deploy request failed')

        const { projectSlug, url } = body.data
        projectEl.textContent = projectSlug
        visitEl.href = url
        socket.emit('subscribe', `logs:${projectSlug}`)
    } catch (err) {
        setStatus('error')
        errorEl.textContent = err.message
    }
})
