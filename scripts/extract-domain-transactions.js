import Database from 'better-sqlite3'
import dayjs from 'dayjs'

const db = new Database('data/monefy.db')

// Extract transactions with "domain" in the note
const transactions = db.prepare(`
    SELECT
        transactions.createdOn,
        accounts._id AS accountId,
        accounts.title AS accountName,
        categories._id AS categoryId,
        categories.title AS categoryName,
        categories.categoryType AS categoryType,
        transactions.amountCents,
        transactions.note
    FROM transactions
    JOIN accounts ON transactions.account_id = accounts._id
    JOIN categories ON transactions.category_id = categories._id
    WHERE transactions.deletedOn IS NULL
    AND accounts.deletedOn IS NULL
    AND LOWER(transactions.note) LIKE '%domain%'
    ORDER BY transactions.createdOn DESC
`).all()

// Get all transactions to search for service charges
const allTransactions = db.prepare(`
    SELECT
        transactions.createdOn,
        accounts._id AS accountId,
        accounts.title AS accountName,
        categories._id AS categoryId,
        categories.title AS categoryName,
        categories.categoryType AS categoryType,
        transactions.amountCents,
        transactions.note
    FROM transactions
    JOIN accounts ON transactions.account_id = accounts._id
    JOIN categories ON transactions.category_id = categories._id
    WHERE transactions.deletedOn IS NULL
    AND accounts.deletedOn IS NULL
    ORDER BY transactions.createdOn DESC
`).all()

console.log(`Found ${transactions.length} transactions containing "domain":\n`)

transactions.forEach((transaction, index) => {
    // Convert epoch timestamp to local date
    const localDate = dayjs(transaction.createdOn).format('YYYY-MM-DD')
    const amount = (transaction.amountCents / 1000).toFixed(2)
    const type = transaction.categoryType === 'Income' ? '🟢' : '🔴'

    console.log(`${index + 1}. ${localDate}`)
    console.log(`   ${type} ${transaction.categoryName} - ${transaction.accountName}`)
    console.log(`   Amount: ${amount}`)
    console.log(`   Note: ${transaction.note}`)

    // Find matching service charges on the same day
    const transactionDate = dayjs(transaction.createdOn).format('YYYY-MM-DD')
    const serviceCharges = allTransactions.filter(t => {
        const tDate = dayjs(t.createdOn).format('YYYY-MM-DD')
        return tDate === transactionDate &&
               t.accountId === transaction.accountId &&
               t.categoryName.toLowerCase().includes('service') &&
               (t.createdOn !== transaction.createdOn || t.categoryId !== transaction.categoryId)
    })

    if (serviceCharges.length > 0) {
        console.log(`   ⚠️  Matching service charges found:`)
        serviceCharges.forEach(charge => {
            const chargeAmount = (charge.amountCents / 1000).toFixed(2)
            console.log(`      - ${charge.categoryName}: ${chargeAmount} - ${charge.note}`)
        })
    }

    console.log('')
})

db.close()
