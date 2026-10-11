const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
})

const PROJECT_ID = process.env.PROJECT_ID

console.log('PROJECT_ID:', JSON.stringify(PROJECT_ID))
if (!PROJECT_ID) {
    console.error('PROJECT_ID is not set, aborting')
    process.exit(1)
}

async function init() {
    console.log('Executing script.js')
    const outDirPath = path.join(__dirname, 'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', function (data) {
        console.log(data.toString())  //these are for the npm i logs 
    })

    p.stderr.on('data', function (data) {
        console.log('Error', data.toString()) // these are for the errors 
    })

    p.on('close', async function () {
        console.log('Build Complete')
        const distFolderPath = path.join(__dirname, 'output', 'dist') // basically to have that currdirector/output/dist
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true })

        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file)
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('uploading', filePath)

            const command = new PutObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath) || 'application/octet-stream'
            })

            await s3Client.send(command)

            console.log('uploaded', command.input.Key)
        }
    })
}

init()


