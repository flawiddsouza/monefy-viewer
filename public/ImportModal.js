import { formatDate } from './helpers.js'

const DETAIL_LIMIT = 20

export default {
    template: /*html*/ `
        <div v-if="show" class="modal-bg" @click.self="close">
            <div class="modal" :class="{ 'modal-wide': importStep === 'diff' }">
                <div class="modal-head">
                    <h2>Import Monefy Database</h2>
                    <button class="modal-x" type="button" @click="close">✕</button>
                </div>

                <div class="modal-body">
                    <template v-if="importStep === 'upload'">
                        <p>Select a Monefy database file (.db) to compare and import.</p>
                        <label class="visually-hidden" for="monefy-db-upload">Monefy database file</label>
                        <input id="monefy-db-upload" ref="fileInput" class="modal-file" type="file" accept=".db" @change="handleFileSelect">
                        <div class="modal-actions">
                            <button class="btn-compare" type="button" :disabled="!selectedFile || uploading" @click="uploadDatabase">
                                {{ uploading ? 'Uploading...' : 'Upload & Compare' }}
                            </button>
                            <button class="btn-cancel" type="button" :disabled="uploading" @click="close">Cancel</button>
                        </div>
                    </template>

                    <template v-else-if="importStep === 'diff'">
                        <p class="modal-lead">Review the diff before importing it into your current database.</p>

                        <div class="diff-grid">
                            <section v-for="section in diffSections" :key="section.key" class="diff-card">
                                <div class="diff-card-head">
                                    <h3>{{ section.title }}</h3>
                                    <span :class="deltaClass(section.delta)">{{ formatDelta(section.delta) }}</span>
                                </div>

                                <div class="diff-metrics">
                                    <span class="diff-metric"><strong>Before:</strong> {{ section.current }}</span>
                                    <span class="diff-metric"><strong>After:</strong> {{ section.next }}</span>
                                </div>

                                <div v-if="section.currentDateRange || section.newDateRange" class="date-range">
                                    <div v-if="section.currentDateRange?.latest"><strong>Before latest:</strong> {{ formatDate(section.currentDateRange.latest) }}</div>
                                    <div v-if="section.newDateRange?.latest"><strong>After latest:</strong> {{ formatDate(section.newDateRange.latest) }}</div>
                                </div>

                                <div v-for="detail in section.details" :key="detail.title" class="detail-block">
                                    <details v-if="detail.items.length > 0">
                                        <summary>{{ detail.title }} ({{ detail.countLabel }})</summary>
                                        <ul class="detail-list" :class="{ 'detail-list-deleted': detail.deleted }">
                                            <li v-for="entry in detail.items" :key="detail.key(entry)">{{ detail.format(entry) }}</li>
                                        </ul>
                                    </details>
                                </div>
                            </section>
                        </div>

                        <div class="modal-actions" style="margin-top: 16px;">
                            <button class="btn-compare" type="button" :disabled="importing" @click="importDatabase">
                                {{ importing ? 'Importing...' : 'Import Database' }}
                            </button>
                            <button class="btn-cancel" type="button" :disabled="importing" @click="cancelImport">Cancel</button>
                        </div>
                    </template>

                    <template v-else-if="importStep === 'success'">
                        <div class="success-card">
                            <div class="success-icon">✓</div>
                            <h3>Import Successful</h3>
                            <p v-if="hasChanges">The following changes were applied to the database.</p>
                            <p v-else>No changes were needed. Both databases are already in sync.</p>

                            <ul v-if="hasChanges" class="success-list">
                                <li v-for="item in successItems" :key="item.label">{{ item.label }}</li>
                            </ul>

                            <div class="modal-actions" style="justify-content: center;">
                                <button class="btn-compare" type="button" @click="reloadAfterImport">Reload Page</button>
                            </div>
                        </div>
                    </template>

                    <div v-if="importError" class="error-message">
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
            importStep: 'upload',
            selectedFile: null,
            uploading: false,
            importing: false,
            dbDiff: null,
            importError: null,
            importResult: null,
        }
    },
    computed: {
        diffSections() {
            if (!this.dbDiff) return []

            return [
                {
                    key: 'accounts',
                    title: 'Accounts',
                    current: this.dbDiff.accounts.current,
                    next: this.dbDiff.accounts.new,
                    delta: this.dbDiff.accounts.new - this.dbDiff.accounts.current,
                    details: [
                        {
                            title: 'New Accounts',
                            countLabel: this.dbDiff.accounts.newItems.length,
                            deleted: false,
                            items: this.dbDiff.accounts.newItems,
                            key: account => account._id,
                            format: account => `${account.title} - Initial amount: ${this.formatAmount(account.initialAmountCents)}`
                        },
                        {
                            title: 'Initial Amount Changes',
                            countLabel: this.dbDiff.accounts.balanceDiffs.length,
                            deleted: false,
                            items: this.dbDiff.accounts.balanceDiffs,
                            key: diff => `${diff.title}:${diff.newBalance}`,
                            format: diff => `${diff.title}: ${this.formatAmount(diff.currentBalance)} → ${this.formatAmount(diff.newBalance)} (${diff.diff > 0 ? '+' : ''}${this.formatAmount(diff.diff)})`
                        }
                    ]
                },
                {
                    key: 'transactions',
                    title: 'Transactions',
                    current: this.dbDiff.transactions.current,
                    next: this.dbDiff.transactions.new,
                    delta: this.dbDiff.transactions.new - this.dbDiff.transactions.current,
                    currentDateRange: this.dbDiff.transactions.currentDateRange,
                    newDateRange: this.dbDiff.transactions.newDateRange,
                    details: [
                        {
                            title: 'New Transactions',
                            countLabel: `${Math.min(this.dbDiff.transactions.newItems.length, DETAIL_LIMIT)} shown`,
                            deleted: false,
                            items: this.dbDiff.transactions.newItems.slice(0, DETAIL_LIMIT),
                            key: item => item._id,
                            format: item => this.formatTransactionItem(item)
                        },
                        {
                            title: 'Deleted Transactions',
                            countLabel: `${Math.min(this.dbDiff.transactions.deletedItems.length, DETAIL_LIMIT)} shown`,
                            deleted: true,
                            items: this.dbDiff.transactions.deletedItems.slice(0, DETAIL_LIMIT),
                            key: item => item._id,
                            format: item => this.formatTransactionItem(item)
                        }
                    ]
                },
                {
                    key: 'transfers',
                    title: 'Transfers',
                    current: this.dbDiff.transfers.current,
                    next: this.dbDiff.transfers.new,
                    delta: this.dbDiff.transfers.new - this.dbDiff.transfers.current,
                    currentDateRange: this.dbDiff.transfers.currentDateRange,
                    newDateRange: this.dbDiff.transfers.newDateRange,
                    details: [
                        {
                            title: 'New Transfers',
                            countLabel: `${Math.min(this.dbDiff.transfers.newItems.length, DETAIL_LIMIT)} shown`,
                            deleted: false,
                            items: this.dbDiff.transfers.newItems.slice(0, DETAIL_LIMIT),
                            key: item => item._id,
                            format: item => this.formatTransferItem(item)
                        },
                        {
                            title: 'Deleted Transfers',
                            countLabel: `${Math.min(this.dbDiff.transfers.deletedItems.length, DETAIL_LIMIT)} shown`,
                            deleted: true,
                            items: this.dbDiff.transfers.deletedItems.slice(0, DETAIL_LIMIT),
                            key: item => item._id,
                            format: item => this.formatTransferItem(item)
                        }
                    ]
                },
                {
                    key: 'categories',
                    title: 'Categories',
                    current: this.dbDiff.categories.current,
                    next: this.dbDiff.categories.new,
                    delta: this.dbDiff.categories.new - this.dbDiff.categories.current,
                    details: [
                        {
                            title: 'New Categories',
                            countLabel: this.dbDiff.categories.newItems.length,
                            deleted: false,
                            items: this.dbDiff.categories.newItems,
                            key: item => item._id,
                            format: item => `${item.title} (${item.categoryType})`
                        }
                    ]
                }
            ]
        },
        hasChanges() {
            if (!this.importResult) return false
            return this.successItems.length > 0
        },
        successItems() {
            if (!this.importResult) return []

            return [
                { count: this.importResult.accountsAdded, label: `${this.importResult.accountsAdded} account(s) added` },
                { count: this.importResult.accountsUpdated, label: `${this.importResult.accountsUpdated} account(s) updated` },
                { count: this.importResult.categoriesAdded, label: `${this.importResult.categoriesAdded} category(ies) added` },
                { count: this.importResult.transactionsAdded, label: `${this.importResult.transactionsAdded} transaction(s) added` },
                { count: this.importResult.transactionsDeleted, label: `${this.importResult.transactionsDeleted} transaction(s) deleted` },
                { count: this.importResult.transfersAdded, label: `${this.importResult.transfersAdded} transfer(s) added` },
                { count: this.importResult.transfersDeleted, label: `${this.importResult.transfersDeleted} transfer(s) deleted` }
            ].filter(item => item.count > 0)
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
            this.importResult = null
            if (this.$refs.fileInput) {
                this.$refs.fileInput.value = ''
            }
            this.$emit('close')
        },
        handleFileSelect(event) {
            this.selectedFile = event.target.files[0]
            this.importError = null
        },
        deltaClass(delta) {
            if (delta > 0) return 'diff-change'
            if (delta < 0) return 'diff-negative'
            return 'diff-same'
        },
        formatDelta(delta) {
            if (delta > 0) return `+${delta}`
            if (delta < 0) return `${delta}`
            return 'Same'
        },
        formatTransactionItem(item) {
            const direction = item.categoryType === 'Income' ? 'Income' : 'Expense'
            const note = item.note ? ` (${item.note})` : ''
            return `${formatDate(item.createdOn)} - ${direction} ${this.formatAmount(item.amountCents)} - ${item.categoryName}${note} - ${item.accountName}`
        },
        formatTransferItem(item) {
            const note = item.note ? ` (${item.note})` : ''
            return `${formatDate(item.createdOn)} - ${this.formatAmount(item.amountCents)} - ${item.accountFromName} → ${item.accountToName}${note}`
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

            return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        formatDate
    }
}
