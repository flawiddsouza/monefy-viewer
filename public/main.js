import { createApp } from 'vue'
import { formatDate, formatDateRange, getLocalEpoch } from './helpers.js'
import ImportModal from './ImportModal.js'

const todayEpoch = new Date()
const DEFAULT_DISPLAY_TYPE = 'Day'
const DISPLAY_TYPES = new Set(['Day', 'Week', 'Month', 'Year', 'All', 'Interval', 'Choose Date'])
const THEME_STORAGE_KEY = 'MonefyViewer-theme'
const FORMAT_AMOUNT_STORAGE_KEY = 'MonefyViewer-formatAmounts'
const DISPLAY_TYPE_OPTIONS = [
    { value: 'Day', label: 'Day' },
    { value: 'Week', label: 'Week' },
    { value: 'Month', label: 'Month' },
    { value: 'Year', label: 'Year' },
    { value: 'All', label: 'All' },
    { value: 'Interval', label: 'Interval (Give Date Range)' },
    { value: 'Choose Date', label: 'Choose Date' }
]

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

function parseUrlDate(value) {
    if (value === null) return null

    const parsedDate = dayjs(value.replaceAll('_', ':'))
    return parsedDate.isValid() ? parsedDate.valueOf() : null
}

function getInitialAppState() {
    const defaultDateRange = getDefaultDateRange(DEFAULT_DISPLAY_TYPE)
    const url = new URL(window.location.href)
    const requestedDisplayType = url.searchParams.get('display_type')
    const displayType = requestedDisplayType !== null && DISPLAY_TYPES.has(requestedDisplayType)
        ? requestedDisplayType
        : DEFAULT_DISPLAY_TYPE
    const parsedDateFrom = parseUrlDate(url.searchParams.get('date_from'))
    const parsedDateTo = parseUrlDate(url.searchParams.get('date_to'))
    const fallbackDateRange = displayType === 'Interval' || displayType === 'Choose Date'
        ? defaultDateRange
        : getDefaultDateRange(displayType)

    return {
        accountId: url.searchParams.get('account_id') ?? '',
        selectedTagId: url.searchParams.get('tag_id') ?? '',
        displayType,
        dateFrom: parsedDateFrom ?? fallbackDateRange.dateFrom,
        dateTo: parsedDateTo ?? fallbackDateRange.dateTo,
        formatAmounts: localStorage.getItem(FORMAT_AMOUNT_STORAGE_KEY) === 'false' ? false : true,
        theme: localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
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
        <div class="app">
            <header class="topbar">
                <span class="logo">Mone<em>fy</em></span>
                <div class="topbar-sep"></div>
                <label class="topbar-check">
                    <input type="checkbox" v-model="formatAmounts">
                    Format amounts
                </label>
                <button class="theme-btn" type="button" :aria-pressed="String(theme === 'light')" @click="toggleTheme">
                    {{ themeToggleLabel }}
                </button>
                <button class="btn-import" type="button" @click="showImportModal = true">↑ Import</button>
            </header>

            <aside class="sidebar">
                <div class="period-block">
                    <div class="period-nav">
                        <button class="period-btn" type="button" :disabled="navigationDisabled" @click="previous">‹</button>
                        <span class="period-name">{{ label }}</span>
                        <button class="period-btn" type="button" :disabled="nextNavigationDisabled" @click="next">›</button>
                    </div>
                </div>

                <div class="s-divider"></div>

                <div class="balance-block">
                    <div class="balance-micro">{{ balanceLabel }}</div>
                    <div class="balance-num" :class="{ neg: accountBalance < 0 }">{{ formatAmount(accountBalance) }}</div>
                </div>

                <div class="s-divider"></div>

                <div class="s-ctrl">
                    <div class="s-label">Account</div>
                    <select class="s-select" v-model="accountId">
                        <option value="">All accounts</option>
                        <option v-for="account in accounts" :key="account._id" :value="account._id">{{ account.title }}</option>
                    </select>
                </div>

                <div class="s-ctrl">
                    <div class="s-label">Tag filter</div>
                    <select class="s-select" v-model="selectedTagId">
                        <option value="">All</option>
                        <option value="tagged">All with tags</option>
                        <option v-for="tag in tags" :key="tag.id" :value="String(tag.id)">{{ tag.name }} ({{ tag.transactionCount }})</option>
                    </select>
                </div>

                <div class="s-ctrl">
                    <div class="s-label">Period</div>
                    <select class="s-select" v-model="displayType">
                        <option v-for="option in displayTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>

                    <div class="period-extra" :class="{ show: displayType === 'Choose Date' }">
                        <div class="period-extra-grid">
                            <div>
                                <div class="period-field-label">Selected date</div>
                                <input class="period-date-input" type="date" v-model="dateFromComp" @change="dateToComp = $event.target.value; generateFilteredTransfersAndTransactions()">
                            </div>
                        </div>
                    </div>

                    <div class="period-extra" :class="{ show: displayType === 'Interval' }">
                        <div class="period-extra-grid">
                            <div>
                                <div class="period-field-label">From</div>
                                <input class="period-date-input" type="date" v-model="dateFromComp" @change="generateFilteredTransfersAndTransactions()">
                            </div>
                            <div>
                                <div class="period-field-label">To</div>
                                <input class="period-date-input" type="date" v-model="dateToComp" @change="generateFilteredTransfersAndTransactions()">
                            </div>
                        </div>
                        <div class="period-extra-hint">Transactions within the selected range are shown.</div>
                    </div>
                </div>
            </aside>

            <main class="main">
                <section class="main-meta" :class="{ show: selectedTagId !== '' }">
                    <div class="main-meta-line">
                        <template v-if="selectedTagId === 'tagged'">Showing only tagged transactions.</template>
                        <template v-else>Showing only transactions tagged <strong>{{ selectedTagName }}</strong>.</template>
                    </div>
                    <div class="main-meta-count">Matching transactions: <span>{{ matchingEntryCount }}</span></div>
                </section>

                <section v-if="transactionHeads.length === 0" class="empty-state">
                    No transactions match the current filters.
                </section>

                <details open class="cat-section" v-for="head in transactionHeads" :key="head.type + '-' + head.name">
                    <summary>
                        <span class="cat-indicator" :class="headTone(head)"></span>
                        <span class="cat-name">{{ head.name }}</span>
                        <span class="cat-count">{{ head.transactions.length }}</span>
                        <span class="cat-rule"></span>
                        <span class="cat-total" :class="headTone(head)">
                            <EasySelectionSpan>{{ formatAmount(getHeadTotal(head)) }}</EasySelectionSpan>
                        </span>
                        <span class="cat-chev">▶</span>
                    </summary>

                    <div class="txn-rows">
                        <template v-if="head.type === 'carryOver'">
                            <div v-for="carryOver in head.transactions" :key="carryOver.accountId" class="txn-row">
                                <span class="txn-date"></span>
                                <div class="txn-amt-cell">
                                    <span class="txn-dot carryover"></span>
                                    <span class="txn-amt carryover"><EasySelectionSpan>{{ formatAmount(carryOver.amountCents) }}</EasySelectionSpan></span>
                                </div>
                                <div class="txn-body">
                                    <div class="txn-note">{{ carryOver.accountName }}</div>
                                </div>
                                <span class="txn-acct-col"></span>
                            </div>
                        </template>

                        <template v-else>
                            <div v-for="item in head.transactions" :key="item.itemKey" class="txn-row">
                                <span class="txn-date">{{ formatRowDate(item.createdOn) }}</span>
                                <div class="txn-amt-cell">
                                    <span class="txn-dot" :class="rowTone(head, item)"></span>
                                    <span class="txn-amt" :class="rowTone(head, item)">
                                        <EasySelectionSpan>{{ formatAmount(item.amountCents) }}</EasySelectionSpan>
                                    </span>
                                </div>
                                <div class="txn-body">
                                    <div v-if="shouldShowRowNote(item, head)" class="txn-note" :class="{ 'txn-note-muted': !item.note }">
                                        <EasySelectionSpan>{{ item.note || fallbackNote(head) }}</EasySelectionSpan>
                                    </div>

                                    <div class="txn-tags" :class="{ 'txn-tags-tight': !shouldShowRowNote(item, head) }">
                                        <div class="tag-composer">
                                            <button
                                                v-for="tag in item.tags"
                                                :key="tag.id"
                                                type="button"
                                                class="tag-chip tag-chip-remove"
                                                :disabled="isSavingTags(item.itemKey)"
                                                @click="removeTagFromItem(item, tag.id)"
                                            >
                                                {{ tag.name }} ×
                                            </button>

                                            <div class="tag-input-area">
                                                <input
                                                    type="text"
                                                    class="tag-inline-input"
                                                    placeholder="Add tag"
                                                    :ref="element => setTagInputRef(item.itemKey, element)"
                                                    v-model="tagDrafts[item.itemKey]"
                                                    :disabled="isSavingTags(item.itemKey)"
                                                    @keydown.enter.prevent="submitTagDraft(item)"
                                                    @keydown.tab.prevent="acceptFirstSuggestion(item)"
                                                >

                                                <template v-for="tagSuggestions in [filteredTagSuggestions(item)]" :key="'suggestions'">
                                                    <div v-if="tagSuggestions.length > 0" class="tag-suggestions">
                                                        <button
                                                            v-for="tag in tagSuggestions"
                                                            :key="tag.id"
                                                            type="button"
                                                            class="tag-suggestion"
                                                            :disabled="isSavingTags(item.itemKey)"
                                                            @mousedown.prevent="selectTagSuggestion(item, tag)"
                                                        >
                                                            {{ tag.name }}
                                                        </button>
                                                    </div>
                                                    <div v-else-if="showCreateTagHint(item)" class="tag-editor-hint">
                                                        Press Enter to create "{{ normalizeTagDraft(item.itemKey) }}"
                                                    </div>
                                                </template>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <span class="txn-acct-col">{{ rowAccountLabel(head, item) }}</span>
                            </div>
                        </template>
                    </div>
                </details>
            </main>

            <ImportModal :show="showImportModal" :formatAmounts="formatAmounts" @close="showImportModal = false" />
        </div>
    `,
    data() {
        const initialState = getInitialAppState()
        return {
            accounts: [],
            tags: [],
            accountId: initialState.accountId,
            selectedTagId: initialState.selectedTagId,
            displayType: initialState.displayType,
            displayTypeOptions: DISPLAY_TYPE_OPTIONS,
            dateFrom: initialState.dateFrom,
            dateTo: initialState.dateTo,
            formatAmounts: initialState.formatAmounts,
            theme: initialState.theme,
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
        balanceLabel() {
            return this.selectedTagId === '' ? 'Balance' : 'Visible Total'
        },
        label() {
            if ((this.displayType === 'All' || this.displayType === 'Interval') && (this.dateFrom === '' || this.dateTo === '')) {
                return this.displayType === 'All' ? 'All time' : 'Choose a range'
            }
            return this.displayType === 'Day' || this.displayType === 'Choose Date'
                ? formatDate(this.dateFrom)
                : formatDateRange(this.dateFrom, this.dateTo)
        },
        matchingEntryCount() {
            return this.filteredTransactions.length + this.filteredTransfers.length
        },
        navigationDisabled() {
            return this.displayType === 'All' || this.displayType === 'Interval'
        },
        nextNavigationDisabled() {
            if (this.navigationDisabled) return true
            if (this.displayType === 'Day' || this.displayType === 'Choose Date') {
                return dayjs(this.dateFrom).startOf('day').valueOf() >= dayjs().startOf('day').valueOf()
            }

            if (this.displayType === 'Week') {
                return dayjs(this.dateFrom).startOf('day').valueOf() >= dayjs().startOf('week').add(1, 'day').startOf('day').valueOf()
            }

            if (this.displayType === 'Month') {
                return dayjs(this.dateFrom).startOf('month').valueOf() >= dayjs().startOf('month').valueOf()
            }

            if (this.displayType === 'Year') {
                return dayjs(this.dateFrom).startOf('year').valueOf() >= dayjs().startOf('year').valueOf()
            }

            return false
        },
        selectedTagName() {
            return this.tags.find(tag => String(tag.id) === this.selectedTagId)?.name ?? ''
        },
        themeToggleLabel() {
            return this.theme === 'light' ? '☀ Light mode (on)' : '☾ Dark mode (on)'
        },
        dateFromComp: {
            get() {
                return dayjs(this.dateFrom).format('YYYY-MM-DD')
            },
            set(value) {
                this.dateFrom = getLocalEpoch(value, 'start')
            }
        },
        dateToComp: {
            get() {
                return dayjs(this.dateTo).format('YYYY-MM-DD')
            },
            set(value) {
                this.dateTo = getLocalEpoch(value, 'end')
            }
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
            const nextDateRange = this.displayType === 'Interval' || this.displayType === 'Choose Date'
                ? { dateFrom: this.dateFrom, dateTo: this.dateTo }
                : getDefaultDateRange(this.displayType)
            this.dateFrom = nextDateRange.dateFrom
            this.dateTo = nextDateRange.dateTo
            this.generateFilteredTransfersAndTransactions()
            this.syncFiltersToUrl()
        },
        dateFrom() {
            this.syncFiltersToUrl()
        },
        dateTo() {
            this.syncFiltersToUrl()
        },
        formatAmounts() {
            localStorage.setItem(FORMAT_AMOUNT_STORAGE_KEY, this.formatAmounts ? 'true' : 'false')
        },
        theme() {
            localStorage.setItem(THEME_STORAGE_KEY, this.theme)
            this.applyTheme(true)
        },
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
            this.transactions = data.map(transaction => ({
                ...transaction,
                itemType: 'transaction',
                itemId: transaction.transactionId,
                itemKey: `transaction:${transaction.transactionId}`
            }))
            this.ensureTagEditorState()
        },
        async fetchTransfers() {
            const response = await fetch('/transfers')
            const data = await response.json()
            this.transfers = data.map(transfer => ({
                ...transfer,
                itemType: 'transfer',
                itemId: transfer.transferId,
                itemKey: `transfer:${transfer.transferId}`
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
        applyTheme(withTransition = false) {
            const root = document.documentElement
            if (withTransition) {
                root.classList.add('theme-switching')
            }

            root.classList.toggle('light', this.theme === 'light')

            if (!withTransition) return

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    root.classList.remove('theme-switching')
                })
            })
        },
        toggleTheme() {
            this.theme = this.theme === 'light' ? 'dark' : 'light'
        },
        headTone(head) {
            if (head.type === 'carryOver') return 'carryover'
            if (head.type === 'transfer') return 'transfer'
            return head.categoryType === 'Income' ? 'income' : 'expense'
        },
        rowTone(head, item) {
            if (head.type !== 'transfer' || this.accountId === '') {
                return this.headTone(head)
            }

            return item.accountFromId === this.accountId ? 'expense' : 'income'
        },
        fallbackNote(head) {
            return 'No note'
        },
        shouldShowRowNote(item, head) {
            return head.type !== 'transfer' || Boolean(item.note)
        },
        rowAccountLabel(head, item) {
            if (head.type === 'transaction' && this.accountId === '') return item.accountName
            if (head.type === 'transfer' && this.accountId !== '') {
                return item.accountFromId === this.accountId ? item.accountToName : item.accountFromName
            }
            return ''
        },
        formatRowDate(date) {
            return dayjs(date).format('MMM DD')
        },
        getHeadTotal(head) {
            return head.transactions.reduce((total, item) => total + item.amountCents, 0)
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
            return this.availableTagsForItem(item).find(tag => tag.name.toLowerCase() === normalizedName)
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
                const nextTagIds = [...new Set([...item.tags.map(existing => existing.id), tag.id])]
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
            if (this.nextNavigationDisabled) return

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

            const carryOver = {}
            const accountTransfers = this.accountId === ''
                ? this.transfers
                : this.transfers.filter(transfer => transfer.accountFromId === this.accountId || transfer.accountToId === this.accountId)

            if (!isTagFiltered && this.displayType !== 'All') {
                accountTransfers
                    .filter(transfer => transfer.createdOn < this.dateFrom)
                    .forEach(transfer => {
                        const accountFrom = this.accounts.find(account => account._id === transfer.accountFromId)
                        const accountTo = this.accounts.find(account => account._id === transfer.accountToId)
                        let includeFrom = 1
                        let includeTo = 1

                        if (this.accountId === '') {
                            includeFrom = accountFrom?.isIncludedInTotalBalance ?? 1
                            includeTo = accountTo?.isIncludedInTotalBalance ?? 1
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

            let transfers = this.displayType !== 'All'
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
                    transactions
                        .filter(transaction => transaction.createdOn < this.dateFrom)
                        .forEach(transaction => {
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
                this.carryOver = Object.keys(carryOver)
                    .map(accountId => {
                        const account = this.accounts.find(item => item._id === accountId)
                        return {
                            accountId,
                            accountName: account?.title ?? 'Unknown account',
                            amountCents: carryOver[accountId]
                        }
                    })
                    .filter(item => item.amountCents !== 0)
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

            let accountBalance = this.carryOver.reduce((total, item) => total + item.amountCents, 0)

            for (const transaction of this.filteredTransactions) {
                if (transaction.categoryType === 'Income') accountBalance += transaction.amountCents
                if (transaction.categoryType === 'Expense') accountBalance -= transaction.amountCents
            }

            for (const transfer of this.filteredTransfers) {
                if (this.accountId !== '') {
                    if (transfer.accountFromId === this.accountId) accountBalance -= transfer.amountCents
                    if (transfer.accountToId === this.accountId) accountBalance += transfer.amountCents
                    continue
                }

                if (transfer.accountFromIsIncludedInTotalBalance === 1 && transfer.accountToIsIncludedInTotalBalance === 1) continue
                if (transfer.accountFromIsIncludedInTotalBalance === 0 && transfer.accountToIsIncludedInTotalBalance === 1) {
                    accountBalance += transfer.amountCents
                    continue
                }
                accountBalance -= transfer.amountCents
            }

            this.transactionHeads = transactionHeads
            this.accountBalance = accountBalance

            if (this.displayType === 'All') {
                const allDates = [...accountTransfers.map(transfer => transfer.createdOn), ...transactions.map(transaction => transaction.createdOn)]
                if (allDates.length > 0) {
                    this.dateFrom = Math.min(...allDates)
                    this.dateTo = Math.max(...allDates)
                }
            }
        },
        formatDate,
    },
    async created() {
        this.applyTheme(false)

        await Promise.all([this.fetchAccounts(), this.fetchTags(), this.fetchTransactions(), this.fetchTransfers()])
        this.generateFilteredTransfersAndTransactions()
        this.syncFiltersToUrl()
    }
}).mount('#app')
