import { createApp } from 'vue'
import { formatDate, formatDateRange, getLocalEpoch } from './helpers.js'
import ImportModal from './ImportModal.js'

const todayEpoch = new Date()
const DEFAULT_DISPLAY_TYPE = 'Day'
const DISPLAY_TYPES = new Set(['Day', 'Week', 'Month', 'Year', 'All', 'Interval', 'Choose Date'])

function getDefaultDateRange(displayType) {
    if (displayType === 'Week') {
        return {
            dateFrom: getLocalEpoch(dayjs().startOf('week').add(1, 'day'), 'start'),
            dateTo: getLocalEpoch(dayjs().endOf('week').add(1, 'day'), 'end')
        }
    }

    if (displayType === 'Month') {
        return {
            dateFrom: getLocalEpoch(dayjs().startOf('month'), 'start'),
            dateTo: getLocalEpoch(dayjs().endOf('month'), 'end')
        }
    }

    if (displayType === 'Year') {
        return {
            dateFrom: getLocalEpoch(dayjs().startOf('year'), 'start'),
            dateTo: getLocalEpoch(dayjs().endOf('year'), 'end')
        }
    }

    if (displayType === 'All') {
        return { dateFrom: '', dateTo: '' }
    }

    return {
        dateFrom: getLocalEpoch(todayEpoch, 'start'),
        dateTo: getLocalEpoch(todayEpoch, 'end')
    }
}

const EasySelectionSpan = {
    template: /*html*/ `<span contenteditable="true" style="outline: 0" @keydown="handleKeyboard" @cut.prevent @paste.prevent spellcheck="false"><slot></slot></span>`,
    methods: {
        handleKeyboard(event) {
            if (event.ctrlKey && ['f', 'a', 'c'].includes(event.key.toLowerCase())) return
            if (event.keyCode >= 112 && event.keyCode <= 123) return
            event.preventDefault()
        }
    }
}

createApp({
    components: { EasySelectionSpan, ImportModal },
    template: /*html*/ `
        <div>
            <div class="toolbar">
                <button @click="showImportModal = true">Import Database</button>
                <select class="ml-1rem" v-model="accountId">
                    <option value="">All accounts</option>
                    <option v-for="account in accounts" :key="account._id" :value="account._id">{{ account.title }}</option>
                </select>
                <select class="ml-1rem" v-model="selectedTagId">
                    <option value="">All</option>
                    <option value="tagged">All with tags</option>
                    <option v-for="tag in tags" :key="tag.id" :value="String(tag.id)">{{ tag.name }} ({{ tag.transactionCount }})</option>
                </select>
                <select class="ml-1rem" v-model="displayType">
                    <option>Day</option>
                    <option>Week</option>
                    <option>Month</option>
                    <option>Year</option>
                    <option>All</option>
                    <option value="Interval">Interval (Give Date Range)</option>
                    <option>Choose Date</option>
                </select>
                <template v-if="displayType === 'Interval'">
                    <input class="ml-1rem" type="date" v-model="dateFromComp" @change="generateFilteredTransfersAndTransactions()">
                    <input class="ml-1rem" type="date" v-model="dateToComp" @change="generateFilteredTransfersAndTransactions()">
                </template>
                <template v-if="displayType === 'Choose Date'">
                    <input class="ml-1rem" type="date" v-model="dateFromComp" @change="dateToComp = $event.target.value; generateFilteredTransfersAndTransactions();">
                </template>
                <span class="ml-1rem">
                    <label style="user-select: none"><input type="checkbox" v-model="formatAmounts"> Format Amounts</label>
                </span>
            </div>
            <div class="mt-0_5rem" v-if="selectedTagId === 'tagged'">Showing only tagged transactions.</div>
            <div class="mt-0_5rem" v-else-if="selectedTagId !== ''">Showing only transactions tagged <strong>{{ selectedTagName }}</strong>.</div>
            <div class="mt-1rem">
                <button @click="previous" :disabled="displayType === 'All' || displayType === 'Interval'">Previous</button>
                <span>{{ label }}</span>
                <button @click="next" :disabled="displayType === 'All' || displayType === 'Interval'">Next</button>
            </div>
            <div class="mt-1rem" style="font-size: 1.1rem;">{{ balanceLabel }}: {{ formatAmount(accountBalance) }}</div>
            <div class="mt-0_5rem" v-if="selectedTagId !== ''">Matching transactions: {{ filteredTransactions.length }}</div>
            <div class="mt-1rem">
                <details open class="mt-1rem" v-for="transactionHead in transactionHeads" :key="transactionHead.type + '-' + transactionHead.name">
                    <summary style="font-size: 1.1rem;">{{ transactionHead.name }} ({{ transactionHead.transactions.length }}) | {{ formatAmount(transactionHead.transactions.reduce((acc, prev) => acc + prev.amountCents, 0)) }}</summary>
                    <div class="mt-0_5rem transaction-list">
                        <template v-if="transactionHead.type === 'carryOver'">
                            <div v-for="carryOver in transactionHead.transactions" :key="carryOver.accountId" class="mt-0_5rem">
                                <div v-if="accountId === ''">{{ carryOver.accountName }}</div>
                                <div>🔃 <EasySelectionSpan>{{ formatAmount(carryOver.amountCents) }}</EasySelectionSpan></div>
                            </div>
                        </template>
                        <template v-if="transactionHead.type === 'transfer'">
                            <div v-for="transfer in transactionHead.transactions" :key="transfer.createdOn + '-' + transfer.accountFromId + '-' + transfer.accountToId + '-' + transfer.amountCents" class="mt-0_5rem transaction-card">
                                <div v-if="displayType !== 'Date' && displayType !== 'Choose Date'">{{ formatDate(transfer.createdOn) }}</div>
                                <div><template v-if="accountId === '' || transfer.accountFromId === accountId">🔴</template><template v-else>🟢</template> <EasySelectionSpan>{{ formatAmount(transfer.amountCents) }}</EasySelectionSpan> <EasySelectionSpan>{{ transfer.note }}</EasySelectionSpan></div>
                                <div class="tag-section">
                                    <div class="tag-composer">
                                        <button
                                            v-for="tag in transfer.tags"
                                            :key="tag.id"
                                            type="button"
                                            class="tag-chip tag-chip-remove"
                                            :disabled="isSavingTags(transfer.itemKey)"
                                            @click="removeTagFromItem(transfer, tag.id)"
                                        >
                                            {{ tag.name }} ×
                                        </button>
                                        <div class="tag-input-area">
                                            <input
                                                type="text"
                                                class="tag-inline-input"
                                                placeholder="Type a tag to add or create"
                                                :ref="element => setTagInputRef(transfer.itemKey, element)"
                                                v-model="tagDrafts[transfer.itemKey]"
                                                :disabled="isSavingTags(transfer.itemKey)"
                                                @keydown.enter.prevent="submitTagDraft(transfer)"
                                                @keydown.tab.prevent="acceptFirstSuggestion(transfer)"
                                            >
                                            <template v-for="tagSuggestions in [filteredTagSuggestions(transfer)]" :key="'s'">
                                                <div v-if="tagSuggestions.length > 0" class="tag-suggestions">
                                                    <button
                                                        v-for="tag in tagSuggestions"
                                                        :key="tag.id"
                                                        type="button"
                                                        class="tag-suggestion"
                                                        :disabled="isSavingTags(transfer.itemKey)"
                                                        @mousedown.prevent="selectTagSuggestion(transfer, tag)"
                                                    >
                                                        {{ tag.name }}
                                                    </button>
                                                </div>
                                                <div v-else-if="showCreateTagHint(transfer)" class="tag-editor-hint">
                                                    Press Enter to create "{{ normalizeTagDraft(transfer.itemKey) }}"
                                                </div>
                                            </template>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </template>
                        <template v-if="transactionHead.type === 'transaction'">
                            <div v-for="transaction in transactionHead.transactions" :key="transaction.transactionId" class="mt-0_5rem transaction-card">
                                <div v-if="displayType !== 'Date' && displayType !== 'Choose Date'">{{ formatDate(transaction.createdOn) }}</div>
                                <div v-if="accountId === ''">{{ transaction.accountName }}</div>
                                <div><template v-if="transaction.categoryType === 'Income'">🟢</template><template v-else>🔴</template> <EasySelectionSpan>{{ formatAmount(transaction.amountCents) }}</EasySelectionSpan> <EasySelectionSpan>{{ transaction.note }}</EasySelectionSpan></div>
                                <div class="tag-section">
                                    <div class="tag-composer">
                                        <button
                                            v-for="tag in transaction.tags"
                                            :key="tag.id"
                                            type="button"
                                            class="tag-chip tag-chip-remove"
                                            :disabled="isSavingTags(transaction.itemKey)"
                                            @click="removeTagFromItem(transaction, tag.id)"
                                        >
                                            {{ tag.name }} ×
                                        </button>
                                        <div class="tag-input-area">
                                            <input
                                                type="text"
                                                class="tag-inline-input"
                                                placeholder="Type a tag to add or create"
                                                :ref="element => setTagInputRef(transaction.itemKey, element)"
                                                v-model="tagDrafts[transaction.itemKey]"
                                                :disabled="isSavingTags(transaction.itemKey)"
                                                @keydown.enter.prevent="submitTagDraft(transaction)"
                                                @keydown.tab.prevent="acceptFirstSuggestion(transaction)"
                                            >
                                            <template v-for="tagSuggestions in [filteredTagSuggestions(transaction)]" :key="'s'">
                                                <div v-if="tagSuggestions.length > 0" class="tag-suggestions">
                                                    <button
                                                        v-for="tag in tagSuggestions"
                                                        :key="tag.id"
                                                        type="button"
                                                        class="tag-suggestion"
                                                        :disabled="isSavingTags(transaction.itemKey)"
                                                        @mousedown.prevent="selectTagSuggestion(transaction, tag)"
                                                    >
                                                        {{ tag.name }}
                                                    </button>
                                                </div>
                                                <div v-else-if="showCreateTagHint(transaction)" class="tag-editor-hint">
                                                    Press Enter to create "{{ normalizeTagDraft(transaction.itemKey) }}"
                                                </div>
                                            </template>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>
                </details>
            </div>
            <ImportModal :show="showImportModal" :formatAmounts="formatAmounts" @close="showImportModal = false" />
        </div>
    `,
    data() {
        const defaultDateRange = getDefaultDateRange(DEFAULT_DISPLAY_TYPE)
        return {
            accounts: [],
            tags: [],
            accountId: '',
            selectedTagId: '',
            displayType: DEFAULT_DISPLAY_TYPE,
            dateFrom: defaultDateRange.dateFrom,
            dateTo: defaultDateRange.dateTo,
            formatAmounts: true,
            carryOver: [],
            transfers: [],
            transactions: [],
            filteredTransfers: [],
            filteredTransactions: [],
            transactionHeads: [],
            accountBalance: 0,
            showImportModal: false,
            tagDrafts: {},
            tagInputRefs: {},
            savingItemIds: new Set(),
        }
    },
    computed: {
        balanceLabel() { return this.selectedTagId === '' ? 'Balance' : 'Visible Total' },
        label() { return this.displayType === 'Day' || this.displayType === 'Choose Date' ? formatDate(this.dateFrom) : formatDateRange(this.dateFrom, this.dateTo) },
        selectedTagName() { return this.tags.find(tag => String(tag.id) === this.selectedTagId)?.name ?? '' },
        dateFromComp: {
            get() { return dayjs(this.dateFrom).format('YYYY-MM-DD') },
            set(value) { this.dateFrom = getLocalEpoch(value, 'start') }
        },
        dateToComp: {
            get() { return dayjs(this.dateTo).format('YYYY-MM-DD') },
            set(value) { this.dateTo = getLocalEpoch(value, 'end') }
        },
    },
    watch: {
        accountId() {
            this.generateFilteredTransfersAndTransactions()
            this.syncFiltersToUrl()
        },
        selectedTagId() {
            this.generateFilteredTransfersAndTransactions()
            this.syncFiltersToUrl()
        },
        displayType() {
            const defaultDateRange = this.displayType === 'Interval' || this.displayType === 'Choose Date'
                ? { dateFrom: this.dateFrom, dateTo: this.dateTo }
                : getDefaultDateRange(this.displayType)
            this.dateFrom = defaultDateRange.dateFrom
            this.dateTo = defaultDateRange.dateTo
            this.generateFilteredTransfersAndTransactions()
            this.syncFiltersToUrl()
        },
        dateFrom() { this.syncFiltersToUrl() },
        dateTo() { this.syncFiltersToUrl() },
        formatAmounts() { localStorage.setItem('MonefyViewer-formatAmounts', this.formatAmounts ? 'true' : 'false') },
    },
    methods: {
        async fetchAccounts() {
            const response = await fetch('/accounts')
            this.accounts = await response.json()
            if (this.accountId !== '' && !this.accounts.some(account => account._id === this.accountId)) {
                this.accountId = ''
            }
        },
        async fetchTags() {
            const response = await fetch('/tags')
            this.tags = await response.json()
            if (this.selectedTagId !== '' && this.selectedTagId !== 'tagged' && !this.tags.some(tag => String(tag.id) === this.selectedTagId)) {
                this.selectedTagId = ''
            }
        },
        async fetchTransactions() {
            const response = await fetch('/transactions')
            const data = await response.json()
            this.transactions = data.map(t => ({
                ...t,
                itemType: 'transaction',
                itemId: t.transactionId,
                itemKey: `transaction:${t.transactionId}`
            }))
            this.ensureTagEditorState()
        },
        async fetchTransfers() {
            const response = await fetch('/transfers')
            const data = await response.json()
            this.transfers = data.map(t => ({
                ...t,
                itemType: 'transfer',
                itemId: t.transferId,
                itemKey: `transfer:${t.transferId}`
            }))
            this.ensureTagEditorState()
        },
        syncFiltersToUrl() {
            const url = new URL(window.location.href)
            const defaultDateRange = getDefaultDateRange(this.displayType)
            const alwaysPersistDates = this.displayType !== DEFAULT_DISPLAY_TYPE && this.displayType !== 'All'

            if (this.accountId === '') url.searchParams.delete('account_id')
            else url.searchParams.set('account_id', this.accountId)

            if (this.selectedTagId === '') url.searchParams.delete('tag_id')
            else url.searchParams.set('tag_id', this.selectedTagId)

            if (this.displayType === DEFAULT_DISPLAY_TYPE) url.searchParams.delete('display_type')
            else url.searchParams.set('display_type', this.displayType)

            if (this.displayType === 'All' || (!alwaysPersistDates && this.dateFrom === defaultDateRange.dateFrom) || this.dateFrom === '') {
                url.searchParams.delete('date_from')
            } else {
                url.searchParams.set('date_from', dayjs(this.dateFrom).toISOString().replaceAll(':', '_'))
            }

            if (this.displayType === 'All' || (!alwaysPersistDates && this.dateTo === defaultDateRange.dateTo) || this.dateTo === '') {
                url.searchParams.delete('date_to')
            } else {
                url.searchParams.set('date_to', dayjs(this.dateTo).toISOString().replaceAll(':', '_'))
            }

            window.history.replaceState({}, '', url)
        },
        setTagInputRef(itemKey, element) {
            if (element) {
                this.tagInputRefs[itemKey] = element
                return
            }

            delete this.tagInputRefs[itemKey]
        },
        focusTagInput(itemKey) {
            this.$nextTick(() => {
                const input = this.tagInputRefs[itemKey]
                if (input) input.focus()
            })
        },
        ensureTagEditorState() {
            const nextDrafts = {}
            for (const item of this.transactions) {
                nextDrafts[item.itemKey] = this.tagDrafts[item.itemKey] ?? ''
            }
            for (const item of this.transfers) {
                nextDrafts[item.itemKey] = this.tagDrafts[item.itemKey] ?? ''
            }
            this.tagDrafts = nextDrafts
        },
        async createTag(name) {
            const response = await fetch('/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error ?? 'Unable to create tag')
            return payload.tag
        },
        async saveItemTags(item, tagIds) {
            const next = new Set(this.savingItemIds)
            next.add(item.itemKey)
            this.savingItemIds = next
            let succeeded = false
            try {
                const response = await fetch(`/${item.itemType}s/${encodeURIComponent(item.itemId)}/tags`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tagIds })
                })
                const payload = await response.json()
                if (!response.ok) throw new Error(payload.error ?? 'Unable to save tags')
                item.tags = payload.tags
                if (this.selectedTagId !== '') {
                    this.generateFilteredTransfersAndTransactions()
                }
                succeeded = true
            } finally {
                const remaining = new Set(this.savingItemIds)
                remaining.delete(item.itemKey)
                this.savingItemIds = remaining
            }
            if (succeeded) await this.fetchTags()
        },
        availableTagsForItem(item) {
            const usedTagIds = new Set(item.tags.map(tag => tag.id))
            return this.tags.filter(tag => !usedTagIds.has(tag.id))
        },
        normalizeTagDraft(itemKey) {
            return `${this.tagDrafts[itemKey] ?? ''}`.replace(/\s+/g, ' ').trim()
        },
        findAvailableTagByName(item, name) {
            const normalizedName = `${name}`.replace(/\s+/g, ' ').trim().toLowerCase()
            return this.availableTagsForItem(item)
                .find(tag => tag.name.toLowerCase() === normalizedName)
        },
        filteredTagSuggestions(item) {
            const draft = this.normalizeTagDraft(item.itemKey).toLowerCase()
            const availableTags = this.availableTagsForItem(item)

            if (draft === '') {
                return []
            }

            return availableTags
                .filter(tag => tag.name.toLowerCase().includes(draft))
                .slice(0, 8)
        },
        showCreateTagHint(item) {
            const draft = this.normalizeTagDraft(item.itemKey)
            return draft !== '' && !this.findAvailableTagByName(item, draft)
        },
        isSavingTags(itemKey) {
            return this.savingItemIds.has(itemKey)
        },
        async selectTagSuggestion(item, tag) {
            this.tagDrafts[item.itemKey] = tag.name
            await this.submitTagDraft(item)
        },
        async acceptFirstSuggestion(item) {
            const suggestions = this.filteredTagSuggestions(item)
            if (suggestions.length > 0) {
                await this.selectTagSuggestion(item, suggestions[0])
                return
            }
            await this.submitTagDraft(item)
        },
        async submitTagDraft(item) {
            const tagName = this.normalizeTagDraft(item.itemKey)
            if (!tagName) return
            try {
                const existingTag = this.findAvailableTagByName(item, tagName)
                const tag = existingTag ?? await this.createTag(tagName)
                const nextTagIds = [...new Set([...item.tags.map(t => t.id), tag.id])]
                await this.saveItemTags(item, nextTagIds)
                this.tagDrafts[item.itemKey] = ''
                this.focusTagInput(item.itemKey)
            } catch (error) {
                window.alert(error.message)
            }
        },
        async removeTagFromItem(item, tagId) {
            try {
                const nextTagIds = item.tags.filter(tag => tag.id !== tagId).map(tag => tag.id)
                await this.saveItemTags(item, nextTagIds)
            } catch (error) {
                window.alert(error.message)
            }
        },
        previous() {
            if (this.displayType === 'Day' || this.displayType === 'Choose Date') {
                const date = dayjs(this.dateFrom).subtract(1, 'day')
                this.dateFrom = getLocalEpoch(date, 'start')
                this.dateTo = getLocalEpoch(date, 'end')
            } else if (this.displayType === 'Week') {
                this.dateFrom = getLocalEpoch(dayjs(this.dateFrom).subtract(1, 'week'), 'start')
                this.dateTo = getLocalEpoch(dayjs(this.dateTo).subtract(1, 'week'), 'end')
            } else if (this.displayType === 'Month') {
                const month = dayjs(this.dateFrom).subtract(1, 'month')
                this.dateFrom = getLocalEpoch(month.startOf('month'), 'start')
                this.dateTo = getLocalEpoch(month.endOf('month'), 'end')
            } else if (this.displayType === 'Year') {
                this.dateFrom = getLocalEpoch(dayjs(this.dateFrom).subtract(1, 'year'), 'start')
                this.dateTo = getLocalEpoch(dayjs(this.dateTo).subtract(1, 'year'), 'end')
            }
            this.generateFilteredTransfersAndTransactions()
        },
        next() {
            if (this.displayType === 'Day' || this.displayType === 'Choose Date') {
                const date = dayjs(this.dateFrom).add(1, 'day')
                this.dateFrom = getLocalEpoch(date, 'start')
                this.dateTo = getLocalEpoch(date, 'end')
            } else if (this.displayType === 'Week') {
                this.dateFrom = getLocalEpoch(dayjs(this.dateFrom).add(1, 'week'), 'start')
                this.dateTo = getLocalEpoch(dayjs(this.dateTo).add(1, 'week'), 'end')
            } else if (this.displayType === 'Month') {
                const month = dayjs(this.dateFrom).add(1, 'month')
                this.dateFrom = getLocalEpoch(month.startOf('month'), 'start')
                this.dateTo = getLocalEpoch(month.endOf('month'), 'end')
            } else if (this.displayType === 'Year') {
                this.dateFrom = getLocalEpoch(dayjs(this.dateFrom).add(1, 'year'), 'start')
                this.dateTo = getLocalEpoch(dayjs(this.dateTo).add(1, 'year'), 'end')
            }
            this.generateFilteredTransfersAndTransactions()
        },
        formatAmount(amountCents) {
            const amount = amountCents / 1000
            if (!this.formatAmounts) return amount
            return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        generateFilteredTransfersAndTransactions() {
            const isTagFiltered = this.selectedTagId !== ''
            const isTaggedOnlyFilter = this.selectedTagId === 'tagged'
            this.carryOver = []
            this.filteredTransfers = []
            this.filteredTransactions = []
            this.transactionHeads = []
            this.accountBalance = 0

            let carryOver = {}
            let transfers = []

            let accountTransfers = this.accountId === ''
                ? this.transfers
                : this.transfers.filter(transfer => transfer.accountFromId === this.accountId || transfer.accountToId === this.accountId)

            if (!isTagFiltered && this.displayType !== 'All') {
                accountTransfers.filter(transfer => transfer.createdOn < this.dateFrom).forEach(transfer => {
                    const accountFrom = this.accounts.find(account => account._id === transfer.accountFromId)
                    const accountTo = this.accounts.find(account => account._id === transfer.accountToId)
                    let includeFrom = 1
                    let includeTo = 1

                    if (this.accountId === '') {
                        includeFrom = accountFrom.isIncludedInTotalBalance
                        includeTo = accountTo.isIncludedInTotalBalance
                    } else {
                        if (transfer.accountFromId !== this.accountId) includeFrom = 0
                        if (transfer.accountToId !== this.accountId) includeTo = 0
                    }

                    if (includeFrom === 1) {
                        if (carryOver[transfer.accountFromId] === undefined) carryOver[transfer.accountFromId] = 0
                        carryOver[transfer.accountFromId] -= transfer.amountCents
                    }
                    if (includeTo === 1) {
                        if (carryOver[transfer.accountToId] === undefined) carryOver[transfer.accountToId] = 0
                        carryOver[transfer.accountToId] += transfer.amountCents
                    }
                })
            }

            transfers = this.displayType !== 'All'
                ? accountTransfers.filter(transfer => transfer.createdOn >= this.dateFrom && transfer.createdOn <= this.dateTo)
                : accountTransfers

            if (isTagFiltered) {
                transfers = transfers.filter(transfer => isTaggedOnlyFilter
                    ? transfer.tags.length > 0
                    : transfer.tags.some(tag => String(tag.id) === this.selectedTagId))
            }

            this.filteredTransfers = transfers

            let transactions = this.accountId === ''
                ? this.transactions.filter(transaction => transaction.isIncludedInTotalBalance === 1)
                : this.transactions.filter(transaction => transaction.accountId === this.accountId)

            if (this.displayType !== 'All') {
                if (!isTagFiltered) {
                    transactions.filter(transaction => transaction.createdOn < this.dateFrom).forEach(transaction => {
                        if (carryOver[transaction.accountId] === undefined) {
                            carryOver[transaction.accountId] = 0
                        }
                        if (transaction.categoryType === 'Income') carryOver[transaction.accountId] += transaction.amountCents
                        if (transaction.categoryType === 'Expense') carryOver[transaction.accountId] -= transaction.amountCents
                    })
                }

                transactions = transactions.filter(transaction => transaction.createdOn >= this.dateFrom && transaction.createdOn <= this.dateTo)
            }

            if (isTagFiltered) {
                transactions = transactions.filter(transaction => isTaggedOnlyFilter
                    ? transaction.tags.length > 0
                    : transaction.tags.some(tag => String(tag.id) === this.selectedTagId))
            } else {
                this.carryOver = Object.keys(carryOver).map(accountId => {
                    const account = this.accounts.find(item => item._id === accountId)
                    return { accountId, accountName: account.title, amountCents: carryOver[accountId] }
                }).filter(item => item.amountCents !== 0)
            }

            this.filteredTransactions = transactions

            const transactionHeads = []
            if (!isTagFiltered && this.carryOver.length > 0) {
                transactionHeads.push({ type: 'carryOver', name: 'Carry Over', transactions: this.carryOver })
            }

            this.filteredTransfers.forEach(transfer => {
                const name = `${transfer.accountFromName} -> ${transfer.accountToName}`
                const transactionHead = transactionHeads.find(item => item.name === name && item.type === 'transfer')
                if (transactionHead === undefined) {
                    transactionHeads.push({ type: 'transfer', name, transactions: [transfer] })
                } else {
                    transactionHead.transactions.push(transfer)
                }
            })

            this.filteredTransactions.forEach(transaction => {
                if (transaction.categoryType !== 'Income') return
                const transactionHead = transactionHeads.find(item => item.name === transaction.categoryName && item.type === 'transaction' && item.categoryType === transaction.categoryType)
                if (transactionHead === undefined) {
                    transactionHeads.push({ type: 'transaction', name: transaction.categoryName, categoryType: transaction.categoryType, transactions: [transaction] })
                } else {
                    transactionHead.transactions.push(transaction)
                }
            })

            this.filteredTransactions.forEach(transaction => {
                if (transaction.categoryType !== 'Expense') return
                const transactionHead = transactionHeads.find(item => item.name === transaction.categoryName && item.type === 'transaction' && item.categoryType === transaction.categoryType)
                if (transactionHead === undefined) {
                    transactionHeads.push({ type: 'transaction', name: transaction.categoryName, categoryType: transaction.categoryType, transactions: [transaction] })
                } else {
                    transactionHead.transactions.push(transaction)
                }
            })

            let accountBalance = 0
            transactionHeads.forEach(transactionHead => {
                transactionHead.transactions.forEach(transaction => {
                    if (transactionHead.type === 'carryOver') accountBalance += transaction.amountCents
                    if (transactionHead.type === 'transaction') {
                        if (transaction.categoryType === 'Expense') accountBalance -= transaction.amountCents
                        if (transaction.categoryType === 'Income') accountBalance += transaction.amountCents
                    }
                    if (transactionHead.type === 'transfer') {
                        if (this.accountId !== '') {
                            if (transaction.accountFromId === this.accountId) accountBalance -= transaction.amountCents
                            if (transaction.accountToId === this.accountId) accountBalance += transaction.amountCents
                        } else {
                            if (transaction.accountFromIsIncludedInTotalBalance === 1 && transaction.accountToIsIncludedInTotalBalance === 1) return
                            if (transaction.accountFromIsIncludedInTotalBalance === 0 && transaction.accountToIsIncludedInTotalBalance === 1) {
                                accountBalance += transaction.amountCents
                                return
                            }
                            accountBalance -= transaction.amountCents
                        }
                    }
                })
            })

            this.transactionHeads = transactionHeads
            this.accountBalance = accountBalance

            if (this.displayType === 'All') {
                const allDates = [...this.transfers.map(transfer => transfer.createdOn), ...this.transactions.map(transaction => transaction.createdOn)]
                if (allDates.length > 0) {
                    this.dateFrom = Math.min(...allDates)
                    this.dateTo = Math.max(...allDates)
                }
            }
        },
        formatDate,
    },
    async created() {
        this.formatAmounts = localStorage.getItem('MonefyViewer-formatAmounts') === 'false' ? false : true
        const url = new URL(window.location.href)
        const accountId = url.searchParams.get('account_id')
        const selectedTagId = url.searchParams.get('tag_id')
        const displayType = url.searchParams.get('display_type')
        const dateFrom = url.searchParams.get('date_from')
        const dateTo = url.searchParams.get('date_to')

        if (accountId !== null) {
            this.accountId = accountId
        }

        if (selectedTagId !== null) {
            this.selectedTagId = selectedTagId
        }

        if (displayType !== null && DISPLAY_TYPES.has(displayType)) {
            this.displayType = displayType
        }

        if (dateFrom !== null) {
            const parsedDateFrom = dayjs(dateFrom.replaceAll('_', ':'))
            if (parsedDateFrom.isValid()) {
                this.dateFrom = parsedDateFrom.valueOf()
            }
        }

        if (dateTo !== null) {
            const parsedDateTo = dayjs(dateTo.replaceAll('_', ':'))
            if (parsedDateTo.isValid()) {
                this.dateTo = parsedDateTo.valueOf()
            }
        }
        await Promise.all([this.fetchAccounts(), this.fetchTags(), this.fetchTransactions(), this.fetchTransfers()])
        this.generateFilteredTransfersAndTransactions()
        this.syncFiltersToUrl()
    }
}).mount('#app')
