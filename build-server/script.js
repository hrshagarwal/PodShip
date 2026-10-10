const { exec } = require('child_process')
const path = require('path')

async function init() {
    console.log('Executing script.js')
    const outDirPath = path.join(__dirname, 'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', function (data) {
        console.log(data.toString())
    })

    p.stderr.on('data', function (data) {
        console.log('Error', data.toString())
    })

    p.on('close', function () {
        console.log('Build Complete')
    })
}

init()
