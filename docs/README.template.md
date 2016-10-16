<h1 align="center">
  <a href="https://interledger.org"><img src="ilp_logo.png" width="150"></a>
  <br>
  Five Bells Wallet Client
</h1>

<h4 align="center">
A high-level JS library for sending and receiving <a href="https://interledger.org">Interledger</a> payments.
</h4>

<br>

[![npm][npm-image]][npm-url] [![standard][standard-image]][standard-url] [![circle][circle-image]][circle-url]

[npm-image]: https://img.shields.io/npm/v/five-bells-wallet-client.svg?style=flat
[npm-url]: https://npmjs.org/package/five-bells-wallet-client
[standard-image]: https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat
[standard-url]: http://standardjs.com/
[circle-image]: https://img.shields.io/circleci/project/interledgerjs/five-bells-wallet-client/master.svg?style=flat
[circle-url]: https://circleci.com/gh/interledgerjs/five-bells-wallet-client

## Installation

`npm install five-bells-wallet-client --save`

## Usage

This is a client for the [`five-bells-wallet`](https://github.com/interledgerjs/five-bells-wallet).

To use it with a hosted demo wallet, create an account on [red.ilpdemo.org](https://red.ilpdemo.org) or [blue.ilpdemo.org](https://blue.ilpdemo.org) (it doesn't matter which because they're connected via the [Interledger Protocol](https://interledger.org)!).


### Sending

```js
const WalletClient = require('five-bells-wallet-client')

const sender = new WalletClient({
  address: 'alice@red.ilpdemo.org',
  password: 'super-secret-password'
})

sender.on('connect', () => {
  console.log('Sender connected')
})

sender.send({
  destination: 'bob@blue.ilpdemo.org',
  destinationAmount: '0.01',
  message: 'Still love you!',
  onQuote: (payment) => {
    console.log('Received a quote; this will cost us: ' + payment.sourceAmount)
  }
}).then((payment) => {
  console.log('Sent payment:', payment)
  console.log('')
}).catch((err) => {
  console.error(err.stack)
})
```

### Receiving

```js
const WalletClient = require('five-bells-wallet-client')

const receiver = new WalletClient({
  address: 'bob@blue.ilpdemo.org',
  password: 'ultra-secret-password'
})

receiver.on('connect', () => {
  console.log('Receiver connected')
})

receiver.on('incoming', (payment) => {
  console.log('Received ' + payment.destinationAmount + ' bucks!')
  console.log(payment.sourceAccount + ' says: ' + payment.message)
})
```

## API Reference

{{#module name="WalletClient"~}}
{{>body~}}
{{>members~}}
{{/module}}

{{#module name="Payment"~}}
{{>body~}}
{{>members~}}
{{/module}}
