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
                    <summary style="font-size: 1.1rem;">Carry Over ({{ carryOver.length }}) | {{ formatAmount(carryOver.reduce((acc, prev) => acc + prev.amountCents, 0)) }}</summary>
                    <div class="mt-0_5rem">
                        <div v-for="carryOverItem in carryOver" class="mt-0_5rem">
                            <div v-if="accountId === ''">{{ carryOverItem.accountName }}</div>
                            <div>{{ formatAmount(carryOverItem.amountCents) }}</div>
                        </div>
                    </div>
                </details>
                <details open class="mt-1rem">
                    <summary style="font-size: 1.1rem;">Transfers ({{ filteredTransfers.length }})</summary>
                    <div class="mt-0_5rem">
                        <div v-for="transfer in filteredTransfers" class="mt-0_5rem">
                            <div>{{ transfer.accountFromName }} -> {{ transfer.accountToName }}</div>
                            <div>{{ transfer.note }}</div>
                            <div>{{ formatAmount(transfer.amountCents) }}</div>
                        </div>
                    </div>
                </details>
                <details open class="mt-1rem">
                    <summary style="font-size: 1.1rem;">Transactions ({{ filteredTransactions.length }})</summary>
                    <div class="mt-0_5rem">
                        <div v-for="transaction in filteredTransactions" class="mt-0_5rem">
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
            filteredTransfers: [],
            filteredTransactions: [],
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
        }
    },
    watch: {
        accountId() {
            this.generateFilteredTransfersAndTransactions()
        },
        displayType() {
            if (this.displayType === 'Day') {
                this.dateFrom = getLocalEpoch(new Date(), 'start')
                this.dateTo = getLocalEpoch(new Date(), 'end')
            }
            this.generateFilteredTransfersAndTransactions()
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
            this.generateFilteredTransfersAndTransactions()
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
            this.generateFilteredTransfersAndTransactions()
        },
        formatAmount(amountCents) {
            const amount = amountCents / 1000
            const formattedAmount = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            return formattedAmount
        },
        generateFilteredTransfersAndTransactions() {
            let carryOver = {}

            let transfers = []

            if (this.accountId === '') {
                transfers = this.transfers
            } else {
                transfers = this.transfers.filter(transfer => transfer.accountFromId === this.accountId || transfer.accountToId === this.accountId)
            }

            transfers.filter(transfer => transfer.createdOn < this.dateFrom).forEach(transfer => {
                const accountFrom = this.accounts.find(account => account._id === transfer.accountFromId)
                if (accountFrom.isIncludedInTotalBalance === 1) {
                    if (carryOver[transfer.accountFromId] === undefined) {
                        carryOver[transfer.accountFromId] = 0
                    }
                    carryOver[transfer.accountFromId] -= transfer.amountCents
                }

                const accountTo = this.accounts.find(account => account._id === transfer.accountToId)
                if (accountTo.isIncludedInTotalBalance === 1) {
                    if (carryOver[transfer.accountToId] === undefined) {
                        carryOver[transfer.accountToId] = 0
                    }
                    carryOver[transfer.accountToId] += transfer.amountCents
                }
            })

            if (this.displayType !== 'All') {
                transfers = transfers.filter(transfer => transfer.createdOn >= this.dateFrom && transfer.createdOn <= this.dateTo)
            }

            this.filteredTransfers = transfers

            let transactions = []

            if (this.accountId === '') {
                transactions = this.transactions
            } else {
                transactions = this.transactions.filter(transaction => transaction.accountId === this.accountId)
            }

            transactions.filter(transaction => transaction.createdOn < this.dateFrom).forEach(transaction => {
                if (transaction.isIncludedInTotalBalance === 0) {
                    return
                }

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

            if(this.displayType !== 'All') {
                transactions = transactions.filter(transaction => transaction.createdOn >= this.dateFrom && transaction.createdOn <= this.dateTo)
            }

            this.carryOver = Object.keys(carryOver).map(accountId => {
                const account = this.accounts.find(account => account._id === accountId)
                return {
                    accountName: account.title,
                    amountCents: carryOver[accountId]
                }
            }).filter(item => item.amountCents !== 0)

            this.filteredTransactions = transactions
        },
    },
    async created() {
        await this.fetchAccounts()
        await this.fetchTransactions()
        await this.fetchTransfers()
        this.generateFilteredTransfersAndTransactions()
    }
}).mount('#app')
