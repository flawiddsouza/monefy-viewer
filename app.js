import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
    getAccounts,
    getCategories,
    getTransactions,
    getTransfers,
    compareDatabase,
    importDatabase,
} from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// Configure multer for file uploads
const upload = multer({
    dest: 'data/temp/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
})

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'data', 'temp')
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
}

app.use(express.static('public'))

app.get('/accounts', (req, res) => {
    const accounts = getAccounts()
    res.json(accounts)
})

app.get('/categories', (req, res) => {
    const categories = getCategories()
    res.json(categories)
})

app.get('/transactions', (req, res) => {
    const transactions = getTransactions()
    res.json(transactions)
})

app.get('/transfers', (req, res) => {
    const transfers = getTransfers()
    res.json(transfers)
})

// Import endpoints
let tempDbPath = null

app.post('/import/upload', upload.single('database'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' })
        }

        // Store the temp file path
        tempDbPath = req.file.path

        // Compare databases
        const diff = compareDatabase(tempDbPath)

        res.json({ diff })
    } catch (error) {
        console.error('Upload error:', error)
        if (tempDbPath && fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath)
            tempDbPath = null
        }
        res.status(500).json({ error: error.message })
    }
})

app.post('/import/confirm', (req, res) => {
    try {
        if (!tempDbPath || !fs.existsSync(tempDbPath)) {
            return res.status(400).json({ error: 'No database file to import' })
        }

        // Import/merge the new database into the current one
        const result = importDatabase(tempDbPath)

        // Clean up temp file
        if (fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath)
        }
        tempDbPath = null

        res.json({ success: true, result })
    } catch (error) {
        console.error('Import error:', error)
        // Clean up temp file on error
        if (tempDbPath && fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath)
        }
        tempDbPath = null
        res.status(500).json({ error: error.message })
    }
})

app.post('/import/cancel', (req, res) => {
    try {
        if (tempDbPath && fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath)
        }
        tempDbPath = null
        res.json({ success: true })
    } catch (error) {
        console.error('Cancel error:', error)
        res.status(500).json({ error: error.message })
    }
})

const port = process.env.PORT ?? 4960

app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`)
})
