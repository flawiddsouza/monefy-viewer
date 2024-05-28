import { createApp } from 'vue'
import { formatDate, formatDateRange, getLocalEpoch } from './helpers.js'

const todayEpoch = new Date()

const EasySelectionSpan = {
    template: /*html*/ `
        <span contenteditable="true" style="outline: 0" @keydown="handleKeyboard" @cut.prevent @paste.prevent><slot></slot></span>
    `,
    methods: {
        handleKeyboard(event) {
            // Allow Ctrl+A
            if (event.ctrlKey && event.key.toLowerCase() === 'a') {
                return
            }

            // Allow Ctrl+C
            if (event.ctrlKey && event.key.toLowerCase() === 'c') {
                return
            }

            // Allow all F keys (F1 through F12)
            if (event.keyCode >= 112 && event.keyCode <= 123) {
                return
            }

            event.preventDefault()
        }
    }
}

createApp({
    components: {
        EasySelectionSpan
    },
    template: /*html*/ `
        <div>
            <div>
                <select v-model="accountId">
                    <option value="">All accounts</option>
                    <option v-for="account in accounts" :value="account._id">{{ account.title }}</option>
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
                    <label style="user-select: none">
                        <input type="checkbox" v-model="formatAmounts"> Format Amounts
                    </label>
                </span>
            </div>
            <div class="mt-1rem">
                <button @click="previous" :disabled="displayType === 'All' || displayType === 'Interval'">Previous</button> <span>{{ label }}</span> <button @click="next" :disabled="displayType === 'All' || displayType === 'Interval'">Next</button>
            </div>
            <div class="mt-1rem" style="font-size: 1.1rem;">
                Balance: {{ formatAmount(accountBalance) }}
            </div>
            <div class="mt-1rem">
                <details open class="mt-1rem" v-for="transactionHead in transactionHeads">
                    <summary style="font-size: 1.1rem;">{{ transactionHead.name }} ({{ transactionHead.transactions.length }}) | {{ formatAmount(transactionHead.transactions.reduce((acc, prev) => acc + prev.amountCents, 0)) }}</summary>
                    <div class="mt-0_5rem" style="margin-left: 1.2rem; width: 40rem;">
                        <template v-if="transactionHead.type === 'carryOver'">
                            <div v-for="carryOver in transactionHead.transactions" class="mt-0_5rem">
                                <div v-if="accountId === ''">{{ carryOver.accountName }}</div>
                                <div>🔃 <EasySelectionSpan>{{ formatAmount(carryOver.amountCents) }}</EasySelectionSpan></div>
                            </div>
                        </template>
                        <template v-if="transactionHead.type === 'transfer'">
                            <div v-for="transfer in transactionHead.transactions" class="mt-0_5rem">
                                <div v-if="displayType !== 'Date' && displayType !== 'Choose Date'">{{ formatDate(transfer.createdOn) }}</div>
                                <div><template v-if="accountId === '' || transfer.accountFromId === accountId">🔴</template><template v-else>🟢</template> <EasySelectionSpan>{{ formatAmount(transfer.amountCents) }}</EasySelectionSpan> <EasySelectionSpan>{{ transfer.note }}</EasySelectionSpan></div>
                            </div>
                        </template>
                        <template v-if="transactionHead.type === 'transaction'">
                            <div v-for="transaction in transactionHead.transactions" class="mt-0_5rem">
                                <div v-if="displayType !== 'Date' && displayType !== 'Choose Date'">{{ formatDate(transaction.createdOn) }}</div>
                                <div v-if="accountId === ''">{{ transaction.accountName }}</div>
                                <div><template v-if="transaction.categoryType === 'Income'">🟢</template><template v-else>🔴</template> <EasySelectionSpan>{{ formatAmount(transaction.amountCents) }}</EasySelectionSpan> <EasySelectionSpan>{{ transaction.note }}</EasySelectionSpan></div>
                            </div>
                        </template>
                    </div>
                </details>
            </div>
        </div>
    `,
    data() {
        return {
            accounts: [],
            accountId: '',
            displayType: 'Day',
            dateFrom: getLocalEpoch(todayEpoch, 'start'),
            dateTo: getLocalEpoch(todayEpoch, 'end'),
            formatAmounts: true,
            balance: 0,
            carryOver: [],
            transfers: [],
            transactions: [],
            filteredTransfers: [],
            filteredTransactions: [],
            transactionHeads: [],
            accountBalance: 0,
        }
    },
    computed: {
        label() {
            if (this.displayType === 'Day' || this.displayType === 'Choose Date') {
                return formatDate(this.dateFrom)
            } else {
                return formatDateRange(this.dateFrom, this.dateTo)
            }
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
        },
        displayType() {
            if (this.displayType === 'Day') {
                this.dateFrom = getLocalEpoch(todayEpoch, 'start')
                this.dateTo = getLocalEpoch(todayEpoch, 'end')
            } else if (this.displayType === 'Week') {
                const startOfWeek = dayjs().startOf('week').add(1, 'day')
                const endOfWeek = dayjs().endOf('week').add(1, 'day')
                this.dateFrom = getLocalEpoch(startOfWeek, 'start')
                this.dateTo = getLocalEpoch(endOfWeek, 'end')
            } else if (this.displayType === 'Month') {
                const startOfMonth = dayjs().startOf('month')
                const endOfMonth = dayjs().endOf('month')
                this.dateFrom = getLocalEpoch(startOfMonth, 'start')
                this.dateTo = getLocalEpoch(endOfMonth, 'end')
            } else if (this.displayType === 'Year') {
                const startOfYear = dayjs().startOf('year')
                const endOfYear = dayjs().endOf('year')
                this.dateFrom = getLocalEpoch(startOfYear, 'start')
                this.dateTo = getLocalEpoch(endOfYear, 'end')
            } else if (this.displayType === 'All') {
                this.dateFrom = ''
                this.dateTo = ''
            }
            this.generateFilteredTransfersAndTransactions()
        },
        dateFrom() {
            const url = new URL(window.location.href)
            url.searchParams.set('dateFrom', dayjs(this.dateFrom).toISOString().replaceAll(':', '_'))
            window.history.pushState({}, '', url)
        },
        dateTo() {
            const url = new URL(window.location.href)
            url.searchParams.set('dateTo', dayjs(this.dateTo).toISOString().replaceAll(':', '_'))
            window.history.pushState({}, '', url)
        },
        formatAmounts() {
            localStorage.setItem('MonefyViewer-formatAmounts', this.formatAmounts ? 'true' : 'false')
        },
    },
    methods: {
        async fetchAccounts() {
            const response = await fetch('/accounts')
            this.accounts = await response.json()
        },
        async fetchTransactions() {
            const response = await fetch(`/transactions`)
            this.transactions = await response.json()
        },
        async fetchTransfers() {
            const response = await fetch(`/transfers`)
            this.transfers = await response.json()
        },
        previous() {
            if (this.displayType === 'Day' || this.displayType === 'Choose Date') {
                const date = dayjs(this.dateFrom).subtract(1, 'day')
                this.dateFrom = getLocalEpoch(date, 'start')
                this.dateTo = getLocalEpoch(date, 'end')
            } else if (this.displayType === 'Week') {
                const startOfWeek = dayjs(this.dateFrom).subtract(1, 'week')
                const endOfWeek = dayjs(this.dateTo).subtract(1, 'week')
                this.dateFrom = getLocalEpoch(startOfWeek, 'start')
                this.dateTo = getLocalEpoch(endOfWeek, 'end')
            } else if (this.displayType === 'Month') {
                const startOfMonth = dayjs(this.dateFrom).subtract(1, 'month')
                const endOfMonth = dayjs(this.dateFrom).subtract(1, 'month').endOf('month')
                this.dateFrom = getLocalEpoch(startOfMonth, 'start')
                this.dateTo = getLocalEpoch(endOfMonth, 'end')
            } else if (this.displayType === 'Year') {
                const startOfYear = dayjs(this.dateFrom).subtract(1, 'year')
                const endOfYear = dayjs(this.dateTo).subtract(1, 'year')
                this.dateFrom = getLocalEpoch(startOfYear, 'start')
                this.dateTo = getLocalEpoch(endOfYear, 'end')
            }
            this.generateFilteredTransfersAndTransactions()
        },
        next() {
            if (this.displayType === 'Day' || this.displayType === 'Choose Date') {
                const date = dayjs(this.dateFrom).add(1, 'day')
                this.dateFrom = getLocalEpoch(date, 'start')
                this.dateTo = getLocalEpoch(date, 'end')
            } else if (this.displayType === 'Week') {
                const startOfWeek = dayjs(this.dateFrom).add(1, 'week')
                const endOfWeek = dayjs(this.dateTo).add(1, 'week')
                this.dateFrom = getLocalEpoch(startOfWeek, 'start')
                this.dateTo = getLocalEpoch(endOfWeek, 'end')
            } else if (this.displayType === 'Month') {
                const startOfMonth = dayjs(this.dateFrom).add(1, 'month').startOf('month')
                const endOfMonth = dayjs(this.dateFrom).add(1, 'month').endOf('month')
                this.dateFrom = getLocalEpoch(startOfMonth, 'start')
                this.dateTo = getLocalEpoch(endOfMonth, 'end')
            } else if (this.displayType === 'Year') {
                const startOfYear = dayjs(this.dateFrom).add(1, 'year')
                const endOfYear = dayjs(this.dateTo).add(1, 'year')
                this.dateFrom = getLocalEpoch(startOfYear, 'start')
                this.dateTo = getLocalEpoch(endOfYear, 'end')
            }
            this.generateFilteredTransfersAndTransactions()
        },
        formatAmount(amountCents) {
            const amount = amountCents / 1000

            if (!this.formatAmounts) {
                return amount
            }

            const formattedAmount = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            return formattedAmount
        },
        generateFilteredTransfersAndTransactions() {
            this.carryOver = []
            this.filteredTransfers = []
            this.filteredTransactions = []
            this.transactionHeads = []
            this.accountBalance = 0

            let carryOver = {}

            let transfers = []

            if (this.accountId === '') {
                transfers = this.transfers
            } else {
                transfers = this.transfers.filter(transfer => transfer.accountFromId === this.accountId || transfer.accountToId === this.accountId)
            }

            if (this.displayType !== 'All') {
                transfers.filter(transfer => transfer.createdOn < this.dateFrom).forEach(transfer => {
                    const accountFrom = this.accounts.find(account => account._id === transfer.accountFromId)
                    const accountTo = this.accounts.find(account => account._id === transfer.accountToId)

                    let isIncludedInTotalBalance1 = 1
                    let isIncludedInTotalBalance2 = 1

                    if (this.accountId === '') {
                        isIncludedInTotalBalance1 = accountFrom.isIncludedInTotalBalance
                        isIncludedInTotalBalance2 = accountTo.isIncludedInTotalBalance
                    } else {
                        // don't include in calculation if the account is not the selected account
                        if (transfer.accountFromId !== this.accountId) {
                            isIncludedInTotalBalance1 = 0
                        }

                        // don't include in calculation if the account is not the selected account
                        if (transfer.accountToId !== this.accountId) {
                            isIncludedInTotalBalance2 = 0
                        }
                    }

                    if (isIncludedInTotalBalance1 === 1) {
                        if (carryOver[transfer.accountFromId] === undefined) {
                            carryOver[transfer.accountFromId] = 0
                        }
                        carryOver[transfer.accountFromId] -= transfer.amountCents
                    }

                    if (isIncludedInTotalBalance2 === 1) {
                        if (carryOver[transfer.accountToId] === undefined) {
                            carryOver[transfer.accountToId] = 0
                        }
                        carryOver[transfer.accountToId] += transfer.amountCents
                    }
                })

                transfers = transfers.filter(transfer => transfer.createdOn >= this.dateFrom && transfer.createdOn <= this.dateTo)
            }

            this.filteredTransfers = transfers

            let transactions = []

            if (this.accountId === '') {
                transactions = this.transactions.filter(transaction => transaction.isIncludedInTotalBalance === 1)
            } else {
                transactions = this.transactions.filter(transaction => transaction.accountId === this.accountId)
            }

            if(this.displayType !== 'All') {
                transactions.filter(transaction => transaction.createdOn < this.dateFrom).forEach(transaction => {
                    if (carryOver[transaction.accountId] === undefined) {
                        carryOver[transaction.accountId] = 0
                    }

                    if (transaction.categoryType === 'Income') {
                        carryOver[transaction.accountId] += transaction.amountCents
                    }

                    if (transaction.categoryType === 'Expense') {
                        carryOver[transaction.accountId] -= transaction.amountCents
                    }
                })

                transactions = transactions.filter(transaction => transaction.createdOn >= this.dateFrom && transaction.createdOn <= this.dateTo)
            }

            this.carryOver = Object.keys(carryOver).map(accountId => {
                const account = this.accounts.find(account => account._id === accountId)
                return {
                    accountId,
                    accountName: account.title,
                    amountCents: carryOver[accountId]
                }
            }).filter(item => item.amountCents !== 0)

            this.filteredTransactions = transactions

            const transactionHeads = []

            if (this.carryOver.length > 0) {
                transactionHeads.push({
                    type: 'carryOver',
                    name: 'Carry Over',
                    transactions: this.carryOver
                })
            }

            this.filteredTransfers.forEach(transfer => {
                const transactionHead = transactionHeads.find(transactionHead => transactionHead.name === `${transfer.accountFromName} -> ${transfer.accountToName}` && transactionHead.type === 'transfer')
                if (transactionHead === undefined) {
                    transactionHeads.push({
                        type: 'transfer',
                        name: `${transfer.accountFromName} -> ${transfer.accountToName}`,
                        transactions: [transfer]
                    })
                } else {
                    transactionHead.transactions.push(transfer)
                }
            })

            // we want income to come first in the view, hence we run the loop twice
            this.filteredTransactions.forEach(transaction => {
                if(transaction.categoryType !== 'Income') {
                    return
                }
                const transactionHead = transactionHeads.find(transactionHead => transactionHead.name === transaction.categoryName && transactionHead.type === 'transaction' && transactionHead.categoryType === transaction.categoryType)
                if (transactionHead === undefined) {
                    transactionHeads.push({
                        type: 'transaction',
                        name: transaction.categoryName,
                        categoryType: transaction.categoryType,
                        transactions: [transaction]
                    })
                } else {
                    transactionHead.transactions.push(transaction)
                }
            })

            this.filteredTransactions.forEach(transaction => {
                if(transaction.categoryType !== 'Expense') {
                    return
                }
                const transactionHead = transactionHeads.find(transactionHead => transactionHead.name === transaction.categoryName && transactionHead.type === 'transaction' && transactionHead.categoryType === transaction.categoryType)
                if (transactionHead === undefined) {
                    transactionHeads.push({
                        type: 'transaction',
                        name: transaction.categoryName,
                        categoryType: transaction.categoryType,
                        transactions: [transaction]
                    })
                } else {
                    transactionHead.transactions.push(transaction)
                }
            })

            let accountBalance = 0

            transactionHeads.forEach(transactionHead => {
                transactionHead.transactions.forEach(transaction => {
                    if (transactionHead.type === 'carryOver') {
                        accountBalance += transaction.amountCents
                    }

                    if (transactionHead.type === 'transaction') {
                        if (transaction.categoryType === 'Expense') {
                            accountBalance -= transaction.amountCents
                        }

                        if (transaction.categoryType === 'Income') {
                            accountBalance += transaction.amountCents
                        }
                    }

                    if(transactionHead.type === 'transfer') {
                        if (this.accountId !== '') {
                            if(transaction.accountFromId === this.accountId) {
                                accountBalance -= transaction.amountCents
                            }

                            if(transaction.accountToId === this.accountId) {
                                accountBalance += transaction.amountCents
                            }
                        } else {
                            if(transaction.accountFromIsIncludedInTotalBalance === 1 && transaction.accountToIsIncludedInTotalBalance === 1) {
                                return
                            }
                            if(transaction.accountFromIsIncludedInTotalBalance === 0 && transaction.accountToIsIncludedInTotalBalance === 1) {
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
                const minDate = Math.min(...this.transfers.map(transfer =>  transfer.createdOn), ...this.transactions.map(transaction => transaction.createdOn))
                const maxDate = Math.max(...this.transfers.map(transfer =>  transfer.createdOn), ...this.transactions.map(transaction => transaction.createdOn))
                this.dateFrom = minDate
                this.dateTo = maxDate
            }
        },
        formatDate,
    },
    async created() {
        this.formatAmounts = localStorage.getItem('MonefyViewer-formatAmounts') === 'false' ? false : true

        const url = new URL(window.location.href)
        const dateFrom = url.searchParams.get('dateFrom')
        const dateTo = url.searchParams.get('dateTo')

        if(dateFrom !== null && dateTo !== null) {
            this.dateFrom = dayjs(dateFrom.replaceAll('_', ':')).valueOf()
            this.dateTo = dayjs(dateTo.replaceAll('_', ':')).valueOf()
        }

        await Promise.all([
            this.fetchAccounts(),
            this.fetchTransactions(),
            this.fetchTransfers()
        ])

        this.generateFilteredTransfersAndTransactions()
    }
}).mount('#app')
