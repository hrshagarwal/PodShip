const $ = (id) => document.getElementById(id)

const form = $('deploy-form')
const gitURLInput = $('gitURL')
const slugInput = $('slug')
const deployBtn = $('deploy-btn')
const errorEl = $('error')
const logsEl = $('logs')

const STAGES = ['queued', 'container', 'install', 'build', 'upload', 'live']
const RECENT_KEY = 'podship-recent'

let currentStage = null
let filesUploaded = 0
let startedAt = null
let timer = null
let current = null

// ---------- socket ----------

const socket = io(window.SOCKET_URL)

socket.on('connect', () => setSocketState(true))
socket.on('disconnect', () => setSocketState(false))
socket.on('connect_error', () => setSocketState(false))

function setSocketState(connected) {
    $('socket-dot').className = connected ? 'dot dot-ok' : 'dot dot-bad'
    $('socket-label').textContent = connected ? 'socket :9001' : 'socket :9001 offline'
}

socket.on('message', (message) => {
    if (message.startsWith('Joined')) {
        $('channel').textContent = message.replace('Joined ', '')
        return
    }

    let text = message
    try {
        text = JSON.parse(message).log
    } catch {
        // plain string message
    }

    // move the pipeline forward based on what the build container reports
    if (text.startsWith('Build Started')) setStage('install')
    else if (/^> \S+ build$/m.test(text)) setStage('build')
    else if (text === 'Starting to upload') setStage('upload')
    else if (text.startsWith('uploaded ')) $('d-files').textContent = ++filesUploaded
    else if (text === 'Done') finish()

    addLog(text)
})

// ---------- pipeline ----------

function setStage(stage) {
    const index = STAGES.indexOf(stage)
    if (index < STAGES.indexOf(currentStage)) return
    currentStage = stage

    document.querySelectorAll('#pipeline li').forEach((li) => {
        const i = STAGES.indexOf(li.dataset.stage)
        li.className = i < index ? 'done' : i === index ? 'active' : ''
    })
}

function markDone(stage) {
    document.querySelector(`#pipeline li[data-stage="${stage}"]`).className = 'done'
}

function resetPipeline() {
    currentStage = null
    document.querySelectorAll('#pipeline li').forEach((li) => (li.className = ''))
}

function finish() {
    setStage('live')
    markDone('live')
    stopTimer()
    setBusy(false)

    const url = current.url
    $('d-url').innerHTML = ''
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = url.replace('http://', '')
    $('d-url').appendChild(link)

    saveRecent({ slug: current.projectSlug, url, at: Date.now() })
}

function fail(message) {
    const active = document.querySelector('#pipeline li.active')
    if (active) active.className = 'failed'
    stopTimer()
    setBusy(false)
    errorEl.textContent = message
}

// ---------- timer ----------

function startTimer() {
    startedAt = Date.now()
    $('elapsed').textContent = '00:00'
    timer = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000)
        $('elapsed').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    }, 1000)
}

function stopTimer() {
    clearInterval(timer)
}

// ---------- logs ----------

function addLog(text) {
    const line = document.createElement('div')
    line.className = 'log-line'
    if (text.startsWith('error:')) line.classList.add('log-error')
    if (['Build Started...', 'Build Complete', 'Starting to upload', 'Done'].includes(text)) line.classList.add('log-mark')
    line.textContent = text
    logsEl.appendChild(line)
    logsEl.scrollTop = logsEl.scrollHeight
}

// ---------- recent deployments (this browser only) ----------

function loadRecent() {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY)) || []
    } catch {
        return []
    }
}

function saveRecent(entry) {
    const list = [entry, ...loadRecent().filter((d) => d.slug !== entry.slug)].slice(0, 5)
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(list))
    } catch {
        // storage unavailable, skip
    }
    renderRecent()
}

function renderRecent() {
    const list = loadRecent()
    if (list.length === 0) return

    const ul = $('recent')
    ul.innerHTML = ''
    for (const d of list) {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = d.url
        a.target = '_blank'
        a.rel = 'noreferrer'
        a.textContent = d.slug
        const time = document.createElement('time')
        time.textContent = new Date(d.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        li.append(a, time)
        ul.appendChild(li)
    }
}

// ---------- form ----------

function setBusy(busy) {
    deployBtn.disabled = busy
    deployBtn.textContent = busy ? 'Deploying…' : 'Deploy'
    gitURLInput.disabled = busy
    slugInput.disabled = busy
}

slugInput.addEventListener('input', () => {
    slugInput.value = slugInput.value.toLowerCase()
})

form.addEventListener('submit', async (e) => {
    e.preventDefault()

    errorEl.textContent = ''
    filesUploaded = 0
    $('d-files').textContent = '0'
    $('d-project').textContent = '—'
    $('d-s3').textContent = '—'
    $('d-url').textContent = '—'
    $('channel').textContent = 'not subscribed'
    logsEl.innerHTML = '<div class="log-line muted">$ requesting a build container…</div>'

    resetPipeline()
    setStage('queued')
    setBusy(true)
    startTimer()

    try {
        const res = await fetch('/project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gitURL: gitURLInput.value.trim(), slug: slugInput.value || undefined })
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Deploy request failed')

        current = body.data
        $('d-project').textContent = current.projectSlug
        $('d-s3').textContent = `__outputs/${current.projectSlug}/`
        setStage('container')
        socket.emit('subscribe', `logs:${current.projectSlug}`)
    } catch (err) {
        fail(err.message)
    }
})

renderRecent()
