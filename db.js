import Database  from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, 'data', 'monefy.db')
let db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

function ensureAppSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            createdAt INTEGER NOT NULL
        );
    `)

    db.exec(`
        CREATE TABLE IF NOT EXISTS item_tags (
            item_type TEXT NOT NULL,
            item_id   TEXT NOT NULL,
            tag_id    INTEGER NOT NULL,
            createdAt INTEGER NOT NULL,
            PRIMARY KEY (item_type, item_id, tag_id),
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_item_tags_item
            ON item_tags (item_type, item_id);
        CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id
            ON item_tags (tag_id);
    `)
}

ensureAppSchema()

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
    db.pragma('foreign_keys = ON')
    ensureAppSchema()
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
            transactions._id AS transactionId,
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

    if (transactions.length === 0) {
        return transactions
    }

    const tagsByTransactionId = new Map()
    const transactionTags = db.prepare(`
        SELECT
            item_tags.item_id AS itemId,
            tags.id,
            tags.name
        FROM item_tags
        JOIN tags ON tags.id = item_tags.tag_id
        JOIN transactions ON transactions._id = item_tags.item_id
        JOIN accounts ON accounts._id = transactions.account_id
        WHERE item_tags.item_type = 'transaction'
        AND transactions.deletedOn IS NULL
        AND accounts.deletedOn IS NULL
        ORDER BY
            item_tags.item_id,
            item_tags.createdAt,
            item_tags.rowid
    `).all()

    for (const tag of transactionTags) {
        if (!tagsByTransactionId.has(tag.itemId)) {
            tagsByTransactionId.set(tag.itemId, [])
        }
        tagsByTransactionId.get(tag.itemId).push({ id: tag.id, name: tag.name })
    }

    return transactions.map(transaction => ({
        ...transaction,
        tags: tagsByTransactionId.get(transaction.transactionId) ?? []
    }))
}

export function getTags() {
    const tags = db.prepare(`
        SELECT
            tags.id,
            tags.name,
            COUNT(DISTINCT CASE
                WHEN item_tags.item_type = 'transaction'
                    AND transactions.deletedOn IS NULL
                    AND accounts.deletedOn IS NULL
                    THEN item_tags.item_id
                WHEN item_tags.item_type = 'transfer'
                    AND transfers.deletedOn IS NULL
                    THEN item_tags.item_id
                ELSE NULL
            END) AS transactionCount
        FROM tags
        LEFT JOIN item_tags ON item_tags.tag_id = tags.id
        LEFT JOIN transactions ON item_tags.item_type = 'transaction'
            AND transactions._id = item_tags.item_id
        LEFT JOIN accounts ON accounts._id = transactions.account_id
        LEFT JOIN transfers ON item_tags.item_type = 'transfer'
            AND transfers._id = item_tags.item_id
        GROUP BY tags.id, tags.name
        ORDER BY tags.name COLLATE NOCASE, tags.id
    `).all()

    return tags
}

function normalizeTagName(name) {
    return `${name ?? ''}`.replace(/\s+/g, ' ').trim()
}

function getItemTags(itemType, itemId) {
    return db.prepare(`
        SELECT tags.id, tags.name
        FROM item_tags
        JOIN tags ON tags.id = item_tags.tag_id
        WHERE item_tags.item_type = ? AND item_tags.item_id = ?
        ORDER BY item_tags.createdAt, item_tags.rowid
    `).all(itemType, itemId)
}

function deleteUnusedTags() {
    db.prepare(`
        DELETE FROM tags
        WHERE id IN (
            SELECT tags.id
            FROM tags
            LEFT JOIN item_tags ON item_tags.tag_id = tags.id
            WHERE item_tags.tag_id IS NULL
        )
    `).run()
}

export function createTag(name) {
    const normalizedName = normalizeTagName(name)

    if (normalizedName === '') {
        throw new Error('Tag name is required')
    }

    const existingTag = db.prepare(`
        SELECT id, name
        FROM tags
        WHERE name = ? COLLATE NOCASE
    `).get(normalizedName)

    if (existingTag) {
        return { ...existingTag, created: false }
    }

    const result = db.prepare(`
        INSERT INTO tags (name, createdAt)
        VALUES (?, ?)
    `).run(normalizedName, Date.now())

    return { id: result.lastInsertRowid, name: normalizedName, created: true }
}

export function updateItemTags(itemType, itemId, tagIds) {
    if (itemType !== 'transaction' && itemType !== 'transfer') {
        throw new Error(`Unknown item type: ${itemType}`)
    }
    const table = itemType === 'transaction' ? 'transactions' : 'transfers'
    const existingItem = db.prepare(`SELECT _id FROM ${table} WHERE _id = ?`).get(itemId)
    if (!existingItem) {
        throw new Error(`${itemType === 'transaction' ? 'Transaction' : 'Transfer'} not found`)
    }

    const normalizedTagIds = [...new Set(
        (Array.isArray(tagIds) ? tagIds : [])
            .map(tagId => Number(tagId))
            .filter(tagId => Number.isInteger(tagId) && tagId > 0)
    )]

    if (normalizedTagIds.length > 0) {
        const placeholders = normalizedTagIds.map(() => '?').join(', ')
        const knownTags = db.prepare(
            `SELECT id FROM tags WHERE id IN (${placeholders})`
        ).all(...normalizedTagIds)

        if (knownTags.length !== normalizedTagIds.length) {
            throw new Error('One or more tags do not exist')
        }
    }

    const deleteStmt = db.prepare(`DELETE FROM item_tags WHERE item_type = ? AND item_id = ?`)
    const insertTagLink = db.prepare(`
        INSERT INTO item_tags (item_type, item_id, tag_id, createdAt)
        VALUES (?, ?, ?, ?)
    `)

    const replaceItemTags = db.transaction(() => {
        deleteStmt.run(itemType, itemId)
        const now = Date.now()
        for (const tagId of normalizedTagIds) {
            insertTagLink.run(itemType, itemId, tagId, now)
        }
        deleteUnusedTags()
    })

    replaceItemTags()
    return getItemTags(itemType, itemId)
}

export function getTransfers() {
    const transfers = db.prepare(`
        SELECT
            transfers._id AS transferId,
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

    if (transfers.length === 0) return transfers

    const tagsByTransferId = new Map()
    const transferTags = db.prepare(`
        SELECT
            item_tags.item_id AS itemId,
            tags.id,
            tags.name
        FROM item_tags
        JOIN tags ON tags.id = item_tags.tag_id
        JOIN transfers ON transfers._id = item_tags.item_id
        WHERE item_tags.item_type = 'transfer'
        AND transfers.deletedOn IS NULL
        ORDER BY
            item_tags.item_id,
            item_tags.createdAt,
            item_tags.rowid
    `).all()

    for (const tag of transferTags) {
        if (!tagsByTransferId.has(tag.itemId)) {
            tagsByTransferId.set(tag.itemId, [])
        }
        tagsByTransferId.get(tag.itemId).push({ id: tag.id, name: tag.name })
    }

    return transfers.map(transfer => ({
        ...transfer,
        tags: tagsByTransferId.get(transfer.transferId) ?? []
    }))
}

function initializeSchemaFromSource(sourceDb) {
    // Get all table creation statements from the source database
    const tables = sourceDb.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type='table' AND sql IS NOT NULL
        ORDER BY name
    `).all()

    // Create tables in the current database
    for (const table of tables) {
        db.prepare(table.sql).run()
    }

    // Get all index creation statements from the source database
    const indices = sourceDb.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type='index' AND sql IS NOT NULL
        ORDER BY name
    `).all()

    // Create indices in the current database
    for (const index of indices) {
        db.prepare(index.sql).run()
    }
}

export function compareDatabase(newDbPath) {
    const newDb = new Database(newDbPath, { readonly: true })

    try {
        // Check if the new database has the required tables
        const requiredTables = ['accounts', 'transactions', 'transfers', 'categories']
        const newDbTables = newDb.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables.map(() => '?').join(',')})
        `).all(...requiredTables).map(row => row.name)

        const missingTablesInNew = requiredTables.filter(table => !newDbTables.includes(table))

        if (missingTablesInNew.length > 0) {
            newDb.close()
            throw new Error(`Invalid Monefy database: missing required tables (${missingTablesInNew.join(', ')})`)
        }

        // Check if the current database has the required tables
        const currentDbTables = db.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables.map(() => '?').join(',')})
        `).all(...requiredTables).map(row => row.name)

        const missingTablesInCurrent = requiredTables.filter(table => !currentDbTables.includes(table))

        // If current database is missing tables, initialize schema from the new database
        if (missingTablesInCurrent.length > 0) {
            console.log('Current database is empty or incomplete. Initializing schema from source...')
            initializeSchemaFromSource(newDb)
        }

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

        const transactionsToAdd = newTransactionsList.filter(t => !currentTransactionIds.has(t._id) && !t.deletedOn)
        const transactionsToDelete = currentTransactionsList.filter(t => !t.deletedOn && newTransactionsList.find(nt => nt._id === t._id && nt.deletedOn))

        // Transfers
        const currentTransferIds = new Set(currentTransfersList.map(t => t._id))

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
        // Check if the new database has the required tables
        const requiredTables = ['accounts', 'transactions', 'transfers', 'categories']
        const newDbTables = newDb.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables.map(() => '?').join(',')})
        `).all(...requiredTables).map(row => row.name)

        const missingTablesInNew = requiredTables.filter(table => !newDbTables.includes(table))

        if (missingTablesInNew.length > 0) {
            newDb.close()
            throw new Error(`Invalid Monefy database: missing required tables (${missingTablesInNew.join(', ')})`)
        }

        // Check if the current database has the required tables
        const currentDbTables = db.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables.map(() => '?').join(',')})
        `).all(...requiredTables).map(row => row.name)

        const missingTablesInCurrent = requiredTables.filter(table => !currentDbTables.includes(table))

        // If current database is missing tables, initialize schema from the new database
        if (missingTablesInCurrent.length > 0) {
            console.log('Current database is empty or incomplete. Initializing schema from source...')
            initializeSchemaFromSource(newDb)
        }

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
