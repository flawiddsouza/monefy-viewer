import { formatDate } from './helpers.js'

export default {
    template: /*html*/ `
        <div v-if="show" class="modal-overlay" @click.self="close">
            <div class="modal">
                <div class="modal-header">
                    <h2>Import Monefy Database</h2>
                    <button @click="close">✕</button>
                </div>
                <div class="modal-body">
                    <div v-if="importStep === 'upload'">
                        <p>Select a Monefy database file (.db) to import:</p>
                        <input type="file" accept=".db" @change="handleFileSelect" ref="fileInput">
                        <div class="mt-1rem">
                            <button @click="uploadDatabase" :disabled="!selectedFile || uploading">
                                {{ uploading ? 'Uploading...' : 'Upload & Compare' }}
                            </button>
                        </div>
                    </div>

                    <div v-if="importStep === 'diff'">
                        <h3>Database Comparison</h3>

                        <div class="diff-summary">
                            <div class="diff-item">
                                <strong>Accounts:</strong>
                                <span class="diff-before">Before Import: {{ dbDiff.accounts.current }}</span>
                                <span class="diff-after">After Import: {{ dbDiff.accounts.new }}</span>
                                <span v-if="dbDiff.accounts.new > dbDiff.accounts.current" class="diff-change">+{{ dbDiff.accounts.new - dbDiff.accounts.current }}</span>
                                <span v-else-if="dbDiff.accounts.new === dbDiff.accounts.current" class="diff-same">Same</span>

                                <div v-if="dbDiff.accounts.newItems && dbDiff.accounts.newItems.length > 0" class="mt-0_5rem">
                                    <details>
                                        <summary><strong>New Accounts ({{ dbDiff.accounts.newItems.length }})</strong></summary>
                                        <ul class="detail-list">
                                            <li v-for="acc in dbDiff.accounts.newItems" :key="acc._id">
                                                {{ acc.title }} - Initial Amount: {{ formatAmount(acc.initialAmountCents) }}
                                            </li>
                                        </ul>
                                    </details>
                                </div>

                                <div v-if="dbDiff.accounts.balanceDiffs && dbDiff.accounts.balanceDiffs.length > 0" class="mt-0_5rem">
                                    <details>
                                        <summary><strong>Initial Amount Changes ({{ dbDiff.accounts.balanceDiffs.length }})</strong></summary>
                                        <ul class="detail-list">
                                            <li v-for="diff in dbDiff.accounts.balanceDiffs" :key="diff.title">
                                                {{ diff.title }}: {{ formatAmount(diff.currentBalance) }} → {{ formatAmount(diff.newBalance) }}
                                                <span :class="diff.diff > 0 ? 'diff-change' : 'diff-negative'">
                                                    {{ diff.diff > 0 ? '+' : '' }}{{ formatAmount(diff.diff) }}
                                                </span>
                                            </li>
                                        </ul>
                                    </details>
                                </div>
                            </div>

                            <div class="diff-item">
                                <strong>Transactions:</strong>
                                <span class="diff-before">Before Import: {{ dbDiff.transactions.current }}</span>
                                <span class="diff-after">After Import: {{ dbDiff.transactions.new }}</span>
                                <span v-if="dbDiff.transactions.new > dbDiff.transactions.current" class="diff-change">+{{ dbDiff.transactions.new - dbDiff.transactions.current }}</span>
                                <span v-else-if="dbDiff.transactions.new === dbDiff.transactions.current" class="diff-same">Same</span>

                                <div v-if="dbDiff.transactions.currentDateRange && dbDiff.transactions.currentDateRange.latest" class="date-range">
                                    <small>Before Import latest: {{ formatDate(dbDiff.transactions.currentDateRange.latest) }}</small>
                                </div>
                                <div v-if="dbDiff.transactions.newDateRange && dbDiff.transactions.newDateRange.latest" class="date-range">
                                    <small>After Import latest: {{ formatDate(dbDiff.transactions.newDateRange.latest) }}</small>
                                </div>

                                <div v-if="dbDiff.transactions.newItems && dbDiff.transactions.newItems.length > 0" class="mt-0_5rem">
                                    <details>
                                        <summary><strong>New Transactions ({{ dbDiff.transactions.newItems.length }} shown)</strong></summary>
                                        <ul class="detail-list">
                                            <li v-for="txn in dbDiff.transactions.newItems.slice(0, 20)" :key="txn._id">
                                                {{ formatDate(txn.createdOn) }} -
                                                <span :class="txn.categoryType === 'Income' ? 'income' : 'expense'">
                                                    {{ txn.categoryType === 'Income' ? '🟢' : '🔴' }}
                                                </span>
                                                {{ formatAmount(txn.amountCents) }} -
                                                {{ txn.categoryName }}
                                                <span v-if="txn.note">({{ txn.note }})</span>
                                                - {{ txn.accountName }}
                                            </li>
                                        </ul>
                                    </details>
                                </div>

                                <div v-if="dbDiff.transactions.deletedItems && dbDiff.transactions.deletedItems.length > 0" class="mt-0_5rem">
                                    <details>
                                        <summary><strong>Deleted Transactions ({{ dbDiff.transactions.deletedItems.length }} shown)</strong></summary>
                                        <ul class="detail-list detail-list-deleted">
                                            <li v-for="txn in dbDiff.transactions.deletedItems.slice(0, 20)" :key="txn._id">
                                                {{ formatDate(txn.createdOn) }} -
                                                <span :class="txn.categoryType === 'Income' ? 'income' : 'expense'">
                                                    {{ txn.categoryType === 'Income' ? '🟢' : '🔴' }}
                                                </span>
                                                {{ formatAmount(txn.amountCents) }} -
                                                {{ txn.categoryName }}
                                                <span v-if="txn.note">({{ txn.note }})</span>
                                                - {{ txn.accountName }}
                                            </li>
                                        </ul>
                                    </details>
                                </div>
                            </div>

                            <div class="diff-item">
                                <strong>Transfers:</strong>
                                <span class="diff-before">Before Import: {{ dbDiff.transfers.current }}</span>
                                <span class="diff-after">After Import: {{ dbDiff.transfers.new }}</span>
                                <span v-if="dbDiff.transfers.new > dbDiff.transfers.current" class="diff-change">+{{ dbDiff.transfers.new - dbDiff.transfers.current }}</span>
                                <span v-else-if="dbDiff.transfers.new === dbDiff.transfers.current" class="diff-same">Same</span>

                                <div v-if="dbDiff.transfers.currentDateRange && dbDiff.transfers.currentDateRange.latest" class="date-range">
                                    <small>Before Import latest: {{ formatDate(dbDiff.transfers.currentDateRange.latest) }}</small>
                                </div>
                                <div v-if="dbDiff.transfers.newDateRange && dbDiff.transfers.newDateRange.latest" class="date-range">
                                    <small>After Import latest: {{ formatDate(dbDiff.transfers.newDateRange.latest) }}</small>
                                </div>

                                <div v-if="dbDiff.transfers.newItems && dbDiff.transfers.newItems.length > 0" class="mt-0_5rem">
                                    <details>
                                        <summary><strong>New Transfers ({{ dbDiff.transfers.newItems.length }} shown)</strong></summary>
                                        <ul class="detail-list">
                                            <li v-for="tfr in dbDiff.transfers.newItems.slice(0, 20)" :key="tfr._id">
                                                {{ formatDate(tfr.createdOn) }} -
                                                🔃 {{ formatAmount(tfr.amountCents) }} -
                                                {{ tfr.accountFromName }} → {{ tfr.accountToName }}
                                                <span v-if="tfr.note">({{ tfr.note }})</span>
                                            </li>
                                        </ul>
                                    </details>
                                </div>

                                <div v-if="dbDiff.transfers.deletedItems && dbDiff.transfers.deletedItems.length > 0" class="mt-0_5rem">
                                    <details>
                                        <summary><strong>Deleted Transfers ({{ dbDiff.transfers.deletedItems.length }} shown)</strong></summary>
                                        <ul class="detail-list detail-list-deleted">
                                            <li v-for="tfr in dbDiff.transfers.deletedItems.slice(0, 20)" :key="tfr._id">
                                                {{ formatDate(tfr.createdOn) }} -
                                                🔃 {{ formatAmount(tfr.amountCents) }} -
                                                {{ tfr.accountFromName }} → {{ tfr.accountToName }}
                                                <span v-if="tfr.note">({{ tfr.note }})</span>
                                            </li>
                                        </ul>
                                    </details>
                                </div>
                            </div>

                            <div class="diff-item">
                                <strong>Categories:</strong>
                                <span class="diff-before">Before Import: {{ dbDiff.categories.current }}</span>
                                <span class="diff-after">After Import: {{ dbDiff.categories.new }}</span>
                                <span v-if="dbDiff.categories.new > dbDiff.categories.current" class="diff-change">+{{ dbDiff.categories.new - dbDiff.categories.current }}</span>
                                <span v-else-if="dbDiff.categories.new === dbDiff.categories.current" class="diff-same">Same</span>

                                <div v-if="dbDiff.categories.newItems && dbDiff.categories.newItems.length > 0" class="mt-0_5rem">
                                    <details>
                                        <summary><strong>New Categories ({{ dbDiff.categories.newItems.length }})</strong></summary>
                                        <ul class="detail-list">
                                            <li v-for="cat in dbDiff.categories.newItems" :key="cat._id">
                                                {{ cat.title }} ({{ cat.categoryType }})
                                            </li>
                                        </ul>
                                    </details>
                                </div>
                            </div>
                        </div>

                        <div class="mt-1rem">
                            <button @click="importDatabase" :disabled="importing" class="btn-import">
                                {{ importing ? 'Importing...' : 'Import Database' }}
                            </button>
                            <button @click="cancelImport" :disabled="importing" class="ml-1rem">
                                Cancel
                            </button>
                        </div>
                    </div>

                    <div v-if="importStep === 'success'">
                        <div class="success-message">
                            <h3>✓ Import Successful!</h3>
                            <div v-if="importResult && hasChanges">
                                <p>The following changes were made:</p>
                                <ul style="text-align: left; display: inline-block;">
                                    <li v-if="importResult.accountsAdded > 0">{{ importResult.accountsAdded }} account(s) added</li>
                                    <li v-if="importResult.accountsUpdated > 0">{{ importResult.accountsUpdated }} account(s) updated</li>
                                    <li v-if="importResult.categoriesAdded > 0">{{ importResult.categoriesAdded }} category(ies) added</li>
                                    <li v-if="importResult.transactionsAdded > 0">{{ importResult.transactionsAdded }} transaction(s) added</li>
                                    <li v-if="importResult.transactionsDeleted > 0">{{ importResult.transactionsDeleted }} transaction(s) deleted</li>
                                    <li v-if="importResult.transfersAdded > 0">{{ importResult.transfersAdded }} transfer(s) added</li>
                                    <li v-if="importResult.transfersDeleted > 0">{{ importResult.transfersDeleted }} transfer(s) deleted</li>
                                </ul>
                            </div>
                            <p v-else-if="importResult && !hasChanges">No changes were needed - databases are already in sync.</p>
                            <button @click="reloadAfterImport">Reload Page</button>
                        </div>
                    </div>

                    <div v-if="importError" class="error-message mt-1rem">
                        {{ importError }}
                    </div>
                </div>
            </div>
        </div>
    `,
    props: {
        show: {
            type: Boolean,
            required: true
        },
        formatAmounts: {
            type: Boolean,
            required: true
        }
    },
    data() {
        return {
            importStep: 'upload', // 'upload', 'diff', 'success'
            selectedFile: null,
            uploading: false,
            importing: false,
            dbDiff: null,
            importError: null,
            importResult: null,
        }
    },
    methods: {
        close() {
            this.importStep = 'upload'
            this.selectedFile = null
            this.uploading = false
            this.importing = false
            this.dbDiff = null
            this.importError = null
            if (this.$refs.fileInput) {
                this.$refs.fileInput.value = ''
            }
            this.$emit('close')
        },
        handleFileSelect(event) {
            this.selectedFile = event.target.files[0]
            this.importError = null
        },
        async uploadDatabase() {
            if (!this.selectedFile) return

            this.uploading = true
            this.importError = null

            try {
                const formData = new FormData()
                formData.append('database', this.selectedFile)

                const response = await fetch('/import/upload', {
                    method: 'POST',
                    body: formData
                })

                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(error.error || 'Failed to upload database')
                }

                const result = await response.json()
                this.dbDiff = result.diff
                this.importStep = 'diff'
            } catch (error) {
                this.importError = error.message
            } finally {
                this.uploading = false
            }
        },
        async importDatabase() {
            this.importing = true
            this.importError = null

            try {
                const response = await fetch('/import/confirm', {
                    method: 'POST'
                })

                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(error.error || 'Failed to import database')
                }

                const result = await response.json()
                this.importResult = result.result
                this.importStep = 'success'
            } catch (error) {
                this.importError = error.message
            } finally {
                this.importing = false
            }
        },
        async cancelImport() {
            try {
                await fetch('/import/cancel', {
                    method: 'POST'
                })
            } catch (error) {
                console.error('Failed to cancel import:', error)
            }
            this.close()
        },
        reloadAfterImport() {
            window.location.reload()
        },
        formatAmount(amountCents) {
            const amount = amountCents / 1000

            if (!this.formatAmounts) {
                return amount
            }

            const formattedAmount = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            return formattedAmount
        },
        formatDate
    },
    computed: {
        hasChanges() {
            if (!this.importResult) return false
            return this.importResult.accountsAdded > 0 ||
                   this.importResult.accountsUpdated > 0 ||
                   this.importResult.categoriesAdded > 0 ||
                   this.importResult.transactionsAdded > 0 ||
                   this.importResult.transactionsDeleted > 0 ||
                   this.importResult.transfersAdded > 0 ||
                   this.importResult.transfersDeleted > 0
        }
    }
}
