import Database  from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, 'data', 'monefy.db')
let db = new Database(dbPath)

db.pragma('journal_mode = WAL')

function closeDatabase() {
    console.log('Closing the database connection.')
    db.close()
}

function reopenDatabase() {
    try {
        db.close()
    } catch (error) {
        console.error('Error closing database:', error)
    }
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
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

export function compareDatabase(newDbPath) {
    const newDb = new Database(newDbPath, { readonly: true })

    try {
        // Get counts for all records (including deleted)
        const currentCounts = {
            accounts: db.prepare('SELECT COUNT(*) as count FROM accounts WHERE deletedOn IS NULL').get().count,
            transactions: db.prepare('SELECT COUNT(*) as count FROM transactions WHERE deletedOn IS NULL').get().count,
            transfers: db.prepare('SELECT COUNT(*) as count FROM transfers WHERE deletedOn IS NULL').get().count,
            categories: db.prepare('SELECT COUNT(*) as count FROM categories').get().count
        }

        const newCounts = {
            accounts: newDb.prepare('SELECT COUNT(*) as count FROM accounts WHERE deletedOn IS NULL').get().count,
            transactions: newDb.prepare('SELECT COUNT(*) as count FROM transactions WHERE deletedOn IS NULL').get().count,
            transfers: newDb.prepare('SELECT COUNT(*) as count FROM transfers WHERE deletedOn IS NULL').get().count,
            categories: newDb.prepare('SELECT COUNT(*) as count FROM categories').get().count
        }

        // Get detailed data for comparison
        const currentAccountsList = db.prepare(`
            SELECT _id, title, initialAmountCents, isIncludedInTotalBalance, createdOn, deletedOn
            FROM accounts ORDER BY title
        `).all()

        const newAccountsList = newDb.prepare(`
            SELECT _id, title, initialAmountCents, isIncludedInTotalBalance, createdOn, deletedOn
            FROM accounts ORDER BY title
        `).all()

        const currentTransactionsList = db.prepare(`
            SELECT
                t._id,
                t.createdOn,
                t.amountCents,
                t.note,
                t.deletedOn,
                a.title as accountName,
                c.title as categoryName,
                c.categoryType
            FROM transactions t
            JOIN accounts a ON t.account_id = a._id
            JOIN categories c ON t.category_id = c._id
            ORDER BY t.createdOn DESC
            LIMIT 100
        `).all()

        const newTransactionsList = newDb.prepare(`
            SELECT
                t._id,
                t.createdOn,
                t.amountCents,
                t.note,
                t.deletedOn,
                a.title as accountName,
                c.title as categoryName,
                c.categoryType
            FROM transactions t
            JOIN accounts a ON t.account_id = a._id
            JOIN categories c ON t.category_id = c._id
            ORDER BY t.createdOn DESC
            LIMIT 100
        `).all()

        const currentTransfersList = db.prepare(`
            SELECT
                t._id,
                t.createdOn,
                t.amountCents,
                t.note,
                t.deletedOn,
                af.title as accountFromName,
                at.title as accountToName
            FROM transfers t
            JOIN accounts af ON t.accountFrom = af._id
            JOIN accounts at ON t.accountTo = at._id
            ORDER BY t.createdOn DESC
            LIMIT 100
        `).all()

        const newTransfersList = newDb.prepare(`
            SELECT
                t._id,
                t.createdOn,
                t.amountCents,
                t.note,
                t.deletedOn,
                af.title as accountFromName,
                at.title as accountToName
            FROM transfers t
            JOIN accounts af ON t.accountFrom = af._id
            JOIN accounts at ON t.accountTo = at._id
            ORDER BY t.createdOn DESC
            LIMIT 100
        `).all()

        const currentCategoriesList = db.prepare(`
            SELECT _id, title, categoryType FROM categories ORDER BY title
        `).all()

        const newCategoriesList = newDb.prepare(`
            SELECT _id, title, categoryType FROM categories ORDER BY title
        `).all()

        // Get date ranges
        const currentTransactionDates = db.prepare(`
            SELECT MIN(createdOn) as earliest, MAX(createdOn) as latest
            FROM transactions WHERE deletedOn IS NULL
        `).get()

        const currentTransferDates = db.prepare(`
            SELECT MIN(createdOn) as earliest, MAX(createdOn) as latest
            FROM transfers WHERE deletedOn IS NULL
        `).get()

        const newTransactionDates = newDb.prepare(`
            SELECT MIN(createdOn) as earliest, MAX(createdOn) as latest
            FROM transactions WHERE deletedOn IS NULL
        `).get()

        const newTransferDates = newDb.prepare(`
            SELECT MIN(createdOn) as earliest, MAX(createdOn) as latest
            FROM transfers WHERE deletedOn IS NULL
        `).get()

        // Find differences

        // Transactions
        const currentTransactionIds = new Set(currentTransactionsList.map(t => t._id))
        const newTransactionIds = new Set(newTransactionsList.map(t => t._id))

        const transactionsToAdd = newTransactionsList.filter(t => !currentTransactionIds.has(t._id) && !t.deletedOn)
        const transactionsToDelete = currentTransactionsList.filter(t => !t.deletedOn && newTransactionsList.find(nt => nt._id === t._id && nt.deletedOn))

        // Transfers
        const currentTransferIds = new Set(currentTransfersList.map(t => t._id))
        const newTransferIds = new Set(newTransfersList.map(t => t._id))

        const transfersToAdd = newTransfersList.filter(t => !currentTransferIds.has(t._id) && !t.deletedOn)
        const transfersToDelete = currentTransfersList.filter(t => !t.deletedOn && newTransfersList.find(nt => nt._id === t._id && nt.deletedOn))

        // Accounts
        const currentAccountTitles = new Set(currentAccountsList.map(a => a.title))
        const accountsToAdd = newAccountsList.filter(a => !currentAccountTitles.has(a.title) && !a.deletedOn)

        // Account balance differences (for accounts that exist in both)
        const accountBalanceDiffs = []
        for (const newAcc of newAccountsList.filter(a => !a.deletedOn)) {
            const currentAcc = currentAccountsList.find(a => a.title === newAcc.title && !a.deletedOn)
            if (currentAcc && currentAcc.initialAmountCents !== newAcc.initialAmountCents) {
                accountBalanceDiffs.push({
                    title: newAcc.title,
                    currentBalance: currentAcc.initialAmountCents,
                    newBalance: newAcc.initialAmountCents,
                    diff: newAcc.initialAmountCents - currentAcc.initialAmountCents
                })
            }
        }

        // Categories
        const currentCategoryTitles = new Set(currentCategoriesList.map(c => c.title))
        const categoriesToAdd = newCategoriesList.filter(c => !currentCategoryTitles.has(c.title))

        newDb.close()

        return {
            accounts: {
                current: currentCounts.accounts,
                new: newCounts.accounts,
                newItems: accountsToAdd,
                balanceDiffs: accountBalanceDiffs
            },
            transactions: {
                current: currentCounts.transactions,
                new: newCounts.transactions,
                currentDateRange: currentTransactionDates,
                newDateRange: newTransactionDates,
                newItems: transactionsToAdd,
                deletedItems: transactionsToDelete
            },
            transfers: {
                current: currentCounts.transfers,
                new: newCounts.transfers,
                currentDateRange: currentTransferDates,
                newDateRange: newTransferDates,
                newItems: transfersToAdd,
                deletedItems: transfersToDelete
            },
            categories: {
                current: currentCounts.categories,
                new: newCounts.categories,
                newItems: categoriesToAdd
            }
        }
    } catch (error) {
        newDb.close()
        throw error
    }
}

export function importDatabase(newDbPath) {
    const newDb = new Database(newDbPath, { readonly: true })

    try {
        // Get all data from new database FIRST (while newDb is still open)
        const newAccounts = newDb.prepare('SELECT * FROM accounts').all()
        const newCategories = newDb.prepare('SELECT * FROM categories').all()
        const newTransactions = newDb.prepare('SELECT * FROM transactions').all()
        const newTransfers = newDb.prepare('SELECT * FROM transfers').all()

        // Close the new database now that we have all the data
        newDb.close()

        // Now run the transaction on the current database
        const importData = db.transaction(() => {
            let stats = {
                accountsAdded: 0,
                accountsUpdated: 0,
                categoriesAdded: 0,
                transactionsAdded: 0,
                transactionsDeleted: 0,
                transfersAdded: 0,
                transfersDeleted: 0
            }

            // Get current data maps
            const currentAccountsMap = new Map(
                db.prepare('SELECT * FROM accounts').all().map(a => [a._id, a])
            )
            const currentCategoriesMap = new Map(
                db.prepare('SELECT * FROM categories').all().map(c => [c._id, c])
            )
            const currentTransactionsMap = new Map(
                db.prepare('SELECT * FROM transactions').all().map(t => [t._id, t])
            )
            const currentTransfersMap = new Map(
                db.prepare('SELECT * FROM transfers').all().map(t => [t._id, t])
            )

            // Prepare statements
            const insertAccount = db.prepare(`
                INSERT OR REPLACE INTO accounts
                (_id, title, initialAmountCents, isIncludedInTotalBalance, deletedOn, createdOn, currencyId, disabledOn, icon, initialAmount, localHashCode, remoteHashCode, hashCode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)

            const insertCategory = db.prepare(`
                INSERT OR REPLACE INTO categories
                (_id, title, categoryType, deletedOn, categoryIcon, disabledOn, imageName, localHashCode, remoteHashCode, hashCode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)

            const insertTransaction = db.prepare(`
                INSERT OR REPLACE INTO transactions
                (_id, account_id, category_id, amountCents, createdOn, note, deletedOn, amount, scheduleId, localHashCode, remoteHashCode, hashCode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)

            const insertTransfer = db.prepare(`
                INSERT OR REPLACE INTO transfers
                (_id, accountFrom, accountTo, amountCents, createdOn, note, deletedOn, amount, localHashCode, remoteHashCode, hashCode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)

            // Process accounts - use latest createdOn as source of truth
            for (const newAcc of newAccounts) {
                const currentAcc = currentAccountsMap.get(newAcc._id)

                if (!currentAcc) {
                    // New account
                    insertAccount.run(
                        newAcc._id, newAcc.title, newAcc.initialAmountCents, newAcc.isIncludedInTotalBalance,
                        newAcc.deletedOn, newAcc.createdOn, newAcc.currencyId,
                        newAcc.disabledOn, newAcc.icon, newAcc.initialAmount, newAcc.localHashCode,
                        newAcc.remoteHashCode, newAcc.hashCode
                    )
                    stats.accountsAdded++
                } else if (newAcc.createdOn > currentAcc.createdOn) {
                    // New version is newer, update
                    insertAccount.run(
                        newAcc._id, newAcc.title, newAcc.initialAmountCents, newAcc.isIncludedInTotalBalance,
                        newAcc.deletedOn, newAcc.createdOn, newAcc.currencyId,
                        newAcc.disabledOn, newAcc.icon, newAcc.initialAmount, newAcc.localHashCode,
                        newAcc.remoteHashCode, newAcc.hashCode
                    )
                    stats.accountsUpdated++
                }
                // If current is newer or same age, keep current (do nothing)
            }

            // Process categories - categories don't have createdOn, so just add if new
            for (const newCat of newCategories) {
                const currentCat = currentCategoriesMap.get(newCat._id)

                if (!currentCat) {
                    insertCategory.run(
                        newCat._id, newCat.title, newCat.categoryType, newCat.deletedOn,
                        newCat.categoryIcon, newCat.disabledOn, newCat.imageName, newCat.localHashCode,
                        newCat.remoteHashCode, newCat.hashCode
                    )
                    stats.categoriesAdded++
                } else {
                    // Always update categories since we can't determine which is newer
                    insertCategory.run(
                        newCat._id, newCat.title, newCat.categoryType, newCat.deletedOn,
                        newCat.categoryIcon, newCat.disabledOn, newCat.imageName, newCat.localHashCode,
                        newCat.remoteHashCode, newCat.hashCode
                    )
                }
            }

            // Process transactions
            for (const newTxn of newTransactions) {
                const currentTxn = currentTransactionsMap.get(newTxn._id)

                if (!currentTxn) {
                    insertTransaction.run(
                        newTxn._id, newTxn.account_id, newTxn.category_id, newTxn.amountCents,
                        newTxn.createdOn, newTxn.note, newTxn.deletedOn, newTxn.amount,
                        newTxn.scheduleId, newTxn.localHashCode, newTxn.remoteHashCode, newTxn.hashCode
                    )
                    if (!newTxn.deletedOn) stats.transactionsAdded++
                } else if (newTxn.createdOn > currentTxn.createdOn) {
                    insertTransaction.run(
                        newTxn._id, newTxn.account_id, newTxn.category_id, newTxn.amountCents,
                        newTxn.createdOn, newTxn.note, newTxn.deletedOn, newTxn.amount,
                        newTxn.scheduleId, newTxn.localHashCode, newTxn.remoteHashCode, newTxn.hashCode
                    )
                    // Track if this is a deletion
                    if (newTxn.deletedOn && !currentTxn.deletedOn) {
                        stats.transactionsDeleted++
                    }
                }
            }

            // Process transfers
            for (const newTfr of newTransfers) {
                const currentTfr = currentTransfersMap.get(newTfr._id)

                if (!currentTfr) {
                    insertTransfer.run(
                        newTfr._id, newTfr.accountFrom, newTfr.accountTo, newTfr.amountCents,
                        newTfr.createdOn, newTfr.note, newTfr.deletedOn, newTfr.amount,
                        newTfr.localHashCode, newTfr.remoteHashCode, newTfr.hashCode
                    )
                    if (!newTfr.deletedOn) stats.transfersAdded++
                } else if (newTfr.createdOn > currentTfr.createdOn) {
                    insertTransfer.run(
                        newTfr._id, newTfr.accountFrom, newTfr.accountTo, newTfr.amountCents,
                        newTfr.createdOn, newTfr.note, newTfr.deletedOn, newTfr.amount,
                        newTfr.localHashCode, newTfr.remoteHashCode, newTfr.hashCode
                    )
                    // Track if this is a deletion
                    if (newTfr.deletedOn && !currentTfr.deletedOn) {
                        stats.transfersDeleted++
                    }
                }
            }

            return stats
        })

        const result = importData()
        console.log('Import completed:', result)
        return result

    } catch (error) {
        try {
            newDb.close()
        } catch (e) {
            // Database might already be closed
        }
        throw error
    }
}
