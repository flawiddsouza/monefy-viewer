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
            <div class="mt-1rem" style="font-size: 1.1rem;">
                Balance: {{ formatAmount(accountBalance) }}
            </div>
            <div class="mt-1rem">
                <details open class="mt-1rem" v-for="transactionHead in transactionHeads">
                    <summary style="font-size: 1.1rem;">{{ transactionHead.name }} ({{ transactionHead.transactions.length }}) | {{ formatAmount(transactionHead.transactions.reduce((acc, prev) => acc + prev.amountCents, 0)) }}</summary>
                    <div class="mt-0_5rem" style="margin-left: 1.2rem;">
                        <template v-if="transactionHead.type === 'carryOver'">
                            <div v-for="carryOver in transactionHead.transactions" class="mt-0_5rem">
                                <div v-if="accountId === ''">{{ carryOver.accountName }}</div>
                                <div>🔃 {{ formatAmount(carryOver.amountCents) }}</div>
                            </div>
                        </template>
                        <template v-if="transactionHead.type === 'transfer'">
                            <div v-for="transfer in transactionHead.transactions" class="mt-0_5rem">
                                <div>🔴 {{ formatAmount(transfer.amountCents) }} {{ transfer.note }}</div>
                            </div>
                        </template>
                        <template v-if="transactionHead.type === 'transaction'">
                            <div v-for="transaction in transactionHead.transactions" class="mt-0_5rem">
                                <div v-if="accountId === ''">{{ transaction.accountName }}</div>
                                <div><template v-if="transaction.categoryType === 'Income'">🟢</template><template v-else>🔴</template> {{ formatAmount(transaction.amountCents) }} {{ transaction.note }}</div>
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
            dateFrom: getLocalEpoch(new Date(), 'start'),
            dateTo: getLocalEpoch(new Date(), 'end'),
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
                transactions = this.transactions.filter(transaction => transaction.isIncludedInTotalBalance === 1)
            } else {
                transactions = this.transactions.filter(transaction => transaction.accountId === this.accountId)
            }

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

            if(this.displayType !== 'All') {
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

            transactionHeads.push({
                type: 'carryOver',
                name: 'Carry Over',
                transactions: this.carryOver
            })

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
                    if(transaction.categoryType === 'Expense' || transactionHead.type === 'transfer') {
                        accountBalance -= transaction.amountCents
                    } else {
                        accountBalance += transaction.amountCents
                    }
                })
            })

            this.transactionHeads = transactionHeads

            this.accountBalance = accountBalance
        },
    },
    async created() {
        await this.fetchAccounts()
        await this.fetchTransactions()
        await this.fetchTransfers()
        this.generateFilteredTransfersAndTransactions()
    }
}).mount('#app')
