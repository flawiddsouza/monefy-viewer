import express from 'express'
import {
    getAccounts,
    getCategories,
    getTransactions,
    getTransfers,
} from './db.js'

const app = express()

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

const port = process.env.PORT ?? 4960

app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`)
})
