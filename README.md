# Five Bells Wallet Client :money_with_wings: :zap: :tada:

> Payments should work like magic :tada:

## Installation

`npm install https://github.com/interledger/five-bells-wallet-client.git`

## Usage

This is a client for the [`five-bells-wallet`](https://github.com/interledger/five-bells-wallet).

To use it with a hosted demo wallet, create an account on [red.ilpdemo.org](https://red.ilpdemo.org) or [blue.ilpdemo.org](https://blue.ilpdemo.org) (it doesn't matter which because they're connected via the [Interledger Protocol](https://interledger.org)!).

```js
'use strict'

const WalletClient = require('.')
const client = new WalletClient({
  address: 'alice@red.ilpdemo.org',
  password: 'alice'
})
client.connect()
  .then(function () {
    console.log('Client connected')

    client.sendPayment({
      destinationAccount: 'bob@blue.ilpdemo.org', // Look! That's an account on a different ledger!
      destinationAmount: '10', // Or you can set a sourceAmount instead
      destinationMemo: {
        somethingYouAreExpecting: 'For that thing, ya know'
      } // You can also set a sourceMemo if you want a reminder what this was for when you get the 'outgoing' notification
    })
    .then(function (payment) {
      console.log('Sent payment: ', payment)
    })
    .catch(function (err) {
      console.log('Error sending payment: ', err)
    })
  })
client.on('incoming', function (transfer) {
  console.log('Got notification of incoming transfer: ', transfer)
})
client.on('outgoing', function (transfer) {
  console.log('Got notification about outgoing transfer: ', transfer)
})
```

## API

### client = new WalletClient(opts)

* `opts.address` - Address at a [`five-bells-wallet`](https://github.com/interledger/five-bells-wallet)
* `opts.password` - You guessed it!

### client.convertAmount(params)

* `params.destinationAccount` - The account that will receive the `destinationAmount`, either in the form `'bob@blue.ilpdemo.org'` or `'https://blue.ilpdemo.org/ledger/accounts/bob'`
* `params.destinationAmount` - The amount, denominated in the currency of the `destinationAccount`'s ledger, that we want to convert 

Returns a Promise that resolves to the `sourceAmount` equivalent

### client.sendPayment(params)

* `params.destinationAccount` - An account to send to, either in the form `'bob@blue.ilpdemo.org'` or `'https://blue.ilpdemo.org/ledger/accounts/bob'`
* `params.destinationAmount` - How much the `destinationAccount` should receive, denoted in their currency
* `params.sourceAmount` - This can be specified instead of the `destinationAmount` if we want a fixed amount to leave our account
* `params.destinationMemo` - A JSON memo to attach to the destination transfer, usually used to let the recipient know what they're being paid for
* `params.sourceMemo` - A JSON memo to attach to the source transfer, potentially useful as a reminder to yourself which transfer this was

Returns a Promise that resolves when the payment is complete

### client.on('incoming', function (notification) {...})

`notification` might look like:

```
{
  "id": "3732dc58-df9b-4c78-a560-980c40d033cd",
  "source_account": "https://red.ilpdemo.org/ledger/accounts/alice",
  "destination_account": "https://red.ilpdemo.org/ledger/accounts/connie",
  "transfers": "https://red.ilpdemo.org/ledger/transfers/fc15ac01-5805-4e7b-95cd-593ba5e76b43",
  "source_amount": "0.1440",
  "destination_amount": "0.1440"
}
```

### client.on('outgoing', function (notification) {...})

`notification` might look like:

```
{
  "id": "3732dc58-df9b-4c78-a560-980c40d033cd",
  "source_account": "https://red.ilpdemo.org/ledger/accounts/connie",
  "destination_account": "https://red.ilpdemo.org/ledger/accounts/alice",
  "transfers": "https://red.ilpdemo.org/ledger/transfers/fc15ac01-5805-4e7b-95cd-593ba5e76b43",
  "source_amount": "0.1440",
  "destination_amount": "0.1440"
}
```

### client.on('incoming_transfer', function (transfer) {...})

Like the `'incoming'` event but with the full Five Bells transfer object:

```js
{
  "id": "https://red.ilpdemo.org/ledger/transfers/ac0a2c73-f818-45de-b08a-a757025061ca",
  "ledger": "https://red.ilpdemo.org/ledger",
  "debits": [
    {
      "account": "https://red.ilpdemo.org/ledger/accounts/blah",
      "amount": "10.0000",
      "authorized": true
    }
  ],
  "credits": [
    {
      "amount": "10.0000",
      "account": "https://red.ilpdemo.org/ledger/accounts/connie",
      "memo": {
        "somethingYouAreExpecting": "For that thing, ya know"
      }
    }
  ],
  "additional_info": {
    "source_account": "https://red.ilpdemo.org/ledger/accounts/blah",
    "source_amount": "10.0000",
    "destination_account": "https://blue.ilpdemo.org/ledger/accounts/bob",
    "destination_amount": "8.7828",
    "part_of_payment": "https://connie.ilpdemo.org/payments/e7e5055e-d34d-49c2-bb99-bb4f45073ae4"
  },
  "state": "executed",
  "execution_condition": {
    "message_hash": "6gLpt780SEjw5WXH8BvjoGRuVl9e459eDZnLJwnFHcMieTElYEPjoVdz6If/jdKow7UC35wr0MHZ/4rQ839dLA==",
    "signer": "https://blue.ilpdemo.org/ledger",
    "public_key": "Lvf3YtnHLMER+VHT0aaeEJF+7WQcvp4iKZAdvMVto7c=",
    "type": "ed25519-sha512"
  },
  "expires_at": "2016-04-09T23:29:47.000Z",
  "timeline": {
    "proposed_at": "2016-04-09T23:29:44.000Z",
    "prepared_at": "2016-04-09T23:29:44.000Z",
    "executed_at": "2016-04-09T23:29:45.000Z"
  }
}
```

### client.on('outgoing_fulfillment', function (transfer, fulfillment) {...})

Fires when an outgoing transfer is executed in case we want the fulfillment of the transfer's `execution_condition`
