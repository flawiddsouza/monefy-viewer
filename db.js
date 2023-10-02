import Database  from 'better-sqlite3'

const db = new Database('data/monefy.db')

db.pragma('journal_mode = WAL')

function closeDatabase() {
    console.log('Closing the database connection.')
    db.close()
}

process.on('SIGINT', () => process.exit())
process.on('exit', closeDatabase)

export function getAccounts() {
    const accounts = db.prepare(`
        SELECT * FROM accounts
        WHERE deletedOn IS NULL
        ORDER BY title
    `).all()
    return accounts
}

export function getCategories() {
    const categories = db.prepare(`SELECT * FROM categories`).all()
    return categories
}

export function getTransactions() {
    const transactions = db.prepare(`
        SELECT
            transactions.createdOn,
            accounts._id AS accountId,
            accounts.title AS accountName,
            accounts.isIncludedInTotalBalance AS isIncludedInTotalBalance,
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

    return transactions
}

export function getTransfers() {
    const transfers = db.prepare(`
        SELECT
            transfers.createdOn,
            accountsFrom._id AS accountFromId,
            accountsTo._id AS accountToId,
            accountsFrom.title AS accountFromName,
            accountsTo.title AS accountToName,
            accountsFrom.isIncludedInTotalBalance AS accountFromIsIncludedInTotalBalance,
            accountsTo.isIncludedInTotalBalance AS accountToIsIncludedInTotalBalance,
            transfers.amountCents,
            transfers.note
        FROM transfers
        JOIN accounts AS accountsFrom ON transfers.accountFrom = accountsFrom._id
        JOIN accounts AS accountsTo ON transfers.accountTo = accountsTo._id
        WHERE transfers.deletedOn IS NULL
        ORDER BY transfers.createdOn DESC
    `).all()
    return transfers
}
