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
  password: 'alice'
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
  password: 'bobbob'
})

receiver.on('connect', () => {
  console.log('Receiver connected')
})

receiver.on('incoming', (payment) => {
  console.log('Received ' + payment.destinationAmount + ' bucks!')
  console.log(payment.sourceAccount + ' says: ' + payment.message)
})
```

### Combined Example

```js
const WalletClient = require('five-bells-wallet-client')

const sender = new WalletClient({
  address: 'alice@red.ilpdemo.org',
  password: 'alice'
})

const receiver = new WalletClient({
  address: 'bob@blue.ilpdemo.org',
  password: 'bobbob'
})

sender.on('connect', () => {
  console.log('Sender connected')
})

receiver.on('connect', () => {
  console.log('Receiver connected')
})

receiver.on('incoming', (payment) => {
  console.log('Received ' + payment.destinationAmount + ' bucks!')
  console.log(payment.sourceAccount + ' says: ' + payment.message)
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

## API Reference

Client for connecting to the five-bells-wallet

<a name="module_WalletClient..WalletClient"></a>

### WalletClient~WalletClient
**Kind**: inner class of <code>[WalletClient](#module_WalletClient)</code>  

* [~WalletClient](#module_WalletClient..WalletClient)
    * [new WalletClient(opts)](#new_module_WalletClient..WalletClient_new)
    * [.connect()](#module_WalletClient..WalletClient+connect) ⇒ <code>Promise.&lt;null&gt;</code>
    * [.isConnected()](#module_WalletClient..WalletClient+isConnected) ⇒ <code>Boolean</code>
    * [.getAccount()](#module_WalletClient..WalletClient+getAccount) ⇒ <code>Promise.&lt;String&gt;</code>
    * [.disconnect()](#module_WalletClient..WalletClient+disconnect) ⇒ <code>null</code>
    * [.payment(params)](#module_WalletClient..WalletClient+payment) ⇒ <code>[Payment](#module_Payment..Payment)</code>
    * [.send(params)](#module_WalletClient..WalletClient+send) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [.convertAmount()](#module_WalletClient..WalletClient+convertAmount) ⇒ <code>Promise.&lt;BigNumber&gt;</code>

<a name="new_module_WalletClient..WalletClient_new"></a>

#### new WalletClient(opts)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| opts | <code>Object</code> |  | WalletClient options |
| opts.address | <code>String</code> |  | Account at five-bells-wallet in the form user@wallet-url.example |
| opts.password | <code>String</code> |  | Account password for five-bells-wallet |
| [opts.autoConnect] | <code>Boolean</code> | <code>true</code> | Subscribe to WebSocket notifications automatically when new event listeners are added |

<a name="module_WalletClient..WalletClient+connect"></a>

#### walletClient.connect() ⇒ <code>Promise.&lt;null&gt;</code>
Login to wallet and subscribe to WebSocket notifications

**Kind**: instance method of <code>[WalletClient](#module_WalletClient..WalletClient)</code>  
**Returns**: <code>Promise.&lt;null&gt;</code> - Resolves once client is subscribed  
<a name="module_WalletClient..WalletClient+isConnected"></a>

#### walletClient.isConnected() ⇒ <code>Boolean</code>
Check if the client is currently subscribed to wallet notifications

**Kind**: instance method of <code>[WalletClient](#module_WalletClient..WalletClient)</code>  
<a name="module_WalletClient..WalletClient+getAccount"></a>

#### walletClient.getAccount() ⇒ <code>Promise.&lt;String&gt;</code>
Get the ledger account URI corresponding to the user's address

**Kind**: instance method of <code>[WalletClient](#module_WalletClient..WalletClient)</code>  
<a name="module_WalletClient..WalletClient+disconnect"></a>

#### walletClient.disconnect() ⇒ <code>null</code>
Unsubscribe from wallet notifications

**Kind**: instance method of <code>[WalletClient](#module_WalletClient..WalletClient)</code>  
<a name="module_WalletClient..WalletClient+payment"></a>

#### walletClient.payment(params) ⇒ <code>[Payment](#module_Payment..Payment)</code>
Create a new Payment object

**Kind**: instance method of <code>[WalletClient](#module_WalletClient..WalletClient)</code>  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>[PaymentParams](#module_Payment..PaymentParams)</code> | Payment parameters |

<a name="module_WalletClient..WalletClient+send"></a>

#### walletClient.send(params) ⇒ <code>Promise.&lt;Object&gt;</code>
Create a new Payment object, get a quote, and send the payment. Resolves when the payment is complete.

**Kind**: instance method of <code>[WalletClient](#module_WalletClient..WalletClient)</code>  
**Returns**: <code>Promise.&lt;Object&gt;</code> - Payment result  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>[PaymentParams](#module_Payment..PaymentParams)</code> | Payment parameters |
| [params.onQuote] | <code>function</code> | Function to call when a quote is received |
| [params.onSent] | <code>function</code> | Function to call when payment is sent (before it is complete) |

<a name="module_WalletClient..WalletClient+convertAmount"></a>

#### walletClient.convertAmount() ⇒ <code>Promise.&lt;BigNumber&gt;</code>
Convert the given destination amount into the local asset

**Kind**: instance method of <code>[WalletClient](#module_WalletClient..WalletClient)</code>  
**Returns**: <code>Promise.&lt;BigNumber&gt;</code> - Source amount as a [BigNumber](https://mikemcl.github.io/bignumber.js/)  

| Param | Type | Description |
| --- | --- | --- |
| params.destinationAmount | <code>String</code> &#124; <code>Number</code> | The destination amount to convert |
| params.destinationAccount | <code>String</code> | Destination account to convert amount for |


Class for quoting and sending payments

<a name="module_Payment..Payment"></a>

### Payment~Payment
**Kind**: inner class of <code>[Payment](#module_Payment)</code>  

* [~Payment](#module_Payment..Payment)
    * [new Payment(walletClient, params)](#new_module_Payment..Payment_new)
    * [.quote()](#module_Payment..Payment+quote) ⇒ <code>[Promise.&lt;PaymentParams&gt;](#module_Payment..PaymentParams)</code>
    * [.send()](#module_Payment..Payment+send) ⇒ <code>Promise.&lt;Object&gt;</code>

<a name="new_module_Payment..Payment_new"></a>

#### new Payment(walletClient, params)

| Param | Type | Description |
| --- | --- | --- |
| walletClient | <code>WalletClient</code> | WalletClient instance used for quoting and sending |
| params | <code>[PaymentParams](#module_Payment..PaymentParams)</code> | Payment parameters |

<a name="module_Payment..Payment+quote"></a>

#### payment.quote() ⇒ <code>[Promise.&lt;PaymentParams&gt;](#module_Payment..PaymentParams)</code>
Get a quote to fill in either the sourceAmount or destinationAmount, whichever was not given.

**Kind**: instance method of <code>[Payment](#module_Payment..Payment)</code>  
**Returns**: <code>[Promise.&lt;PaymentParams&gt;](#module_Payment..PaymentParams)</code> - Original payment params with sourceAmount or destinationAmount filled in  
**Emits**: <code>[quote](#Payment+event_quote)</code>  
<a name="module_Payment..Payment+send"></a>

#### payment.send() ⇒ <code>Promise.&lt;Object&gt;</code>
Execute the payment

**Kind**: instance method of <code>[Payment](#module_Payment..Payment)</code>  
**Returns**: <code>Promise.&lt;Object&gt;</code> - Resolves when the payment is complete  
**Emits**: <code>[sent](#Payment+event_sent)</code>  
<a name="module_Payment..PaymentParams"></a>

### Payment~PaymentParams : <code>Object</code>
**Kind**: inner typedef of <code>[Payment](#module_Payment)</code>  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| destinationAccount | <code>String</code> |  | Receiver account URI |
| [sourceAmount] | <code>String</code> &#124; <code>Number</code> &#124; <code>BigNumber</code> | <code>(quoted from destinationAmount)</code> | Either sourceAmount or destinationAmount must be supplied |
| [destinationAmount] | <code>String</code> &#124; <code>Number</code> &#124; <code>BigNumber</code> | <code>(quoted from sourceAmount)</code> | Either sourceAmount or destinationAmount must be supplied |
| [message] | <code>String</code> | <code>&quot;&quot;</code> | Message to send to recipient |
