import { createApp } from 'vue'
import { formatDate, getLocalEpoch } from './helpers.js'

createApp({
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
                    <option>Interval (Give Date Range)</option>
                    <option>Choose Date</option>
                </select>
            </div>
            <div class="mt-1rem">
                <button @click="previous">Previous</button> <span>{{ label }}</span> <button @click="next">Next</button>
            </div>
            <div class="mt-1rem">
                <details open>
                    <summary>Carry Over ({{ carryOver.length }})</summary>
                    <div>
                        <div v-for="carryOverItem in carryOver">
                            {{ carryOverItem }}
                        </div>
                    </div>
                </details>
                <details open>
                    <summary>Transfers ({{ filteredTransfers.length }})</summary>
                    <div>
                        <div v-for="transfer in filteredTransfers">
                            <div>{{ transfer.accountFromName }} -> {{ transfer.accountToName }}</div>
                            <div>{{ transfer.note }}</div>
                            <div>{{ formatAmount(transfer.amountCents) }}</div>
                        </div>
                    </div>
                </details>
                <details open>
                    <summary>Transactions ({{ filteredTransactions.length }})</summary>
                    <div>
                        <div v-for="transaction in filteredTransactions">
                            <div>{{ transaction.categoryName }}<span v-if="accountId === ''"> ({{ transaction.accountName }})</span></div>
                            <div>{{ transaction.note }}</div>
                            <div>{{ formatAmount(transaction.amountCents) }}</div>
                        </div>
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
            dateFrom: getLocalEpoch(new Date(), 'start'),
            dateTo: getLocalEpoch(new Date(), 'end'),
            balance: 0,
            carryOver: [],
            transfers: [],
            transactions: [],
        }
    },
    computed: {
        label() {
            if (this.displayType === 'Day' || this.displayType === 'Choose Date') {
                return formatDate(this.dateFrom)
            } else if (this.displayType === 'Month') {
                return getMonth(this.dateFrom)
            } else if (this.displayType === 'Year') {
                return getYear(this.dateFrom)
            } else if (this.displayType === 'Week' || this.displayType === 'All' || this.displayType === 'Interval (Give Date Range)') {
                return `${this.dateFrom} - ${this.dateTo}`
            }
        },
        filteredTransfers() {
            let transfers = []

            if(this.accountId === '') {
                transfers = this.transfers
            } else {
                transfers = this.transfers.filter(transfer => transfer.accountFromId === this.accountId || transfer.accountToId === this.accountId)
            }

            if(this.displayType !== 'All') {
                transfers = transfers.filter(transfer => transfer.createdOn >= this.dateFrom && transfer.createdOn <= this.dateTo)
            }

            return transfers
        },
        filteredTransactions() {
            let transactions = []

            if(this.accountId === '') {
                transactions = this.transactions
            } else {
                transactions = this.transactions.filter(transaction => transaction.accountId === this.accountId)
            }

            if(this.displayType !== 'All') {
                transactions = transactions.filter(transaction => transaction.createdOn >= this.dateFrom && transaction.createdOn <= this.dateTo)
            }

            return transactions
        }
    },
    watch: {
        accountId() {
        },
        displayType() {
            if (this.displayType === 'Day') {
                this.dateFrom = getLocalEpoch(new Date(), 'start')
                this.dateTo = getLocalEpoch(new Date(), 'end')
            }
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
            if (this.displayType === 'Day') {
                const date = dayjs(this.dateFrom).subtract(0, 'day')
                this.dateFrom = getLocalEpoch(date, 'start')
                this.dateTo = getLocalEpoch(date, 'end')
            } else if (this.displayType === 'Week') {
                // this.dateFrom = getLocalEpoch(this.dateFrom, -7)
                // this.dateTo = getLocalEpoch(this.dateTo, -7)
            } else if (this.displayType === 'Month') {
                // this.dateFrom = getLocalEpoch(this.dateFrom, -30)
                // this.dateTo = getLocalEpoch(this.dateTo, -30)
            } else if (this.displayType === 'Year') {
                // this.dateFrom = getLocalEpoch(this.dateFrom, -365)
                // this.dateTo = getLocalEpoch(this.dateTo, -365)
            }
        },
        next() {
            if (this.displayType === 'Day') {
                const date = dayjs(this.dateFrom).add(2, 'day')
                this.dateFrom = getLocalEpoch(date, 'start')
                this.dateTo = getLocalEpoch(date, 'end')
            } else if (this.displayType === 'Week') {
                // this.dateFrom = getLocalEpoch(this.dateFrom, 7)
                // this.dateTo = getLocalEpoch(this.dateTo, 7)
            } else if (this.displayType === 'Month') {
                // this.dateFrom = getLocalEpoch(this.dateFrom, 30)
                // this.dateTo = getLocalEpoch(this.dateTo, 30)
            } else if (this.displayType === 'Year') {
                // this.dateFrom = getLocalEpoch(this.dateFrom, 365)
                // this.dateTo = getLocalEpoch(this.dateTo, 365)
            }
        },
        formatAmount(amountCents) {
            const amount = amountCents / 1000
            const formattedAmount = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            return formattedAmount
        }
    },
    created() {
        this.fetchAccounts()
        this.fetchTransactions()
        this.fetchTransfers()
    }
}).mount('#app')
