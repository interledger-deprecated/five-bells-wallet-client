# Five Bells Wallet Client :money_with_wings: :zap: :tada:

> Payments should work like magic :tada:

## Installation

`npm install https://github.com/interledger/five-bells-wallet-client.git`

## Usage

This is a client for the [`five-bells-wallet`](https://github.com/interledger/five-bells-wallet).

To use it with a hosted demo wallet, create an account on [red.ilpdemo.org](https://red.ilpdemo.org) or [blue.ilpdemo.org](https://blue.ilpdemo.org) (it doesn't matter which because they're connected via the [Interledger Protocol](https://interledger.org)!).


### Sending

```js
'use strict'

const WalletClient = require('five-bells-wallet-client')

const sender = new WalletClient({
  address: 'alice@red.ilpdemo.org',
  password: 'alice'
})

sender.on('connect', () => {
  console.log('Sender connected')
})

sender.send({
  destination: 'bob@blue.ilpdemo.org',
  destinationAmount: '0.01',
  message: 'Still love you!',
  onQuote: (quote) => {
    console.log('Received a quote; recipient will receive ' + quote.destinationAmount)
  }
}).then((payment) => {
  console.log('Payment was ' + (payment.result ? 'successful' : 'not successful'))
  console.log('')
}).catch((err) => {
  console.error(err.stack || err)
})
```

### Receiving

```js
'use strict'

const WalletClient = require('five-bells-wallet-client')

const receiver = new WalletClient({
  address: 'bob@blue.ilpdemo.org',
  password: 'bob'
})

receiver.connect()

receiver.on('connect', () => {
  console.log('Receiver connected')
})

receiver.on('incoming', (payment) => {
  console.log('Received ' + payment.destinationAmount + ' bucks!')
  console.log(payment.sourceAccount + ' says: ' + payment.message)
})
```
