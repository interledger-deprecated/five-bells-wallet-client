'use strict'

const socket = require('socket.io-client')
const EventEmitter = require('events').EventEmitter
const request = require('superagent')
const WebFinger = require('webfinger.js')
const Debug = require('debug')
const debug = Debug('WalletClient')
const moment = require('moment')
const BigNumber = require('bignumber.js')
const url = require('url')
const inherits = require('inherits')
const uuid = require('node-uuid')
const Payment = require('./payment').Payment

const RATE_CACHE_REFRESH = 60000

const WEBFINGER_RELS = {
  'https://interledger.org/rel/ledgerAccount': 'ledgerAccount',
  'https://interledger.org/rel/socketIOUri': 'socketIOUri',
  'https://interledger.org/rel/sender/payment': 'paymentUri',
  'https://interledger.org/rel/sender/pathfind': 'pathfindUri'
}

/**
 * Client for connecting to the five-bells-wallet
 * @module WalletClient
 */

/**
 * @class
 * @param {Object} opts WalletClient options
 * @param {String} opts.address Account at five-bells-wallet in the form user@wallet-url.example
 * @param {String} opts.password Account password for five-bells-wallet
 * @param {Boolean} [opts.autoConnect=true] Subscribe to WebSocket notifications automatically when new event listeners are added
 */
function WalletClient (opts) {
  EventEmitter.call(this)

  this.address = opts.address
  this.password = opts.password
  this.autoConnect = (opts.autoConnect !== false ? true : false) // default: true

  if (!this.address) {
    throw new Error('Must instantiate WalletClient with five-bells-wallet address')
  }
  if (!this.password) {
    throw new Error('Must instantiate WalletClient with five-bells-wallet password')
  }

  this.accountUri = null
  this.socketIOUri = null
  this.paymentUri = null
  this.pathfindUri = null
  // TODO get the username from the WebFinger results
  this.username = opts.address.split('@')[0]
  this.socket = null
  // <destinationAccount>: { <destinationAmount>: { sourceAmount: 10, expiresAt: '<date>' } }
  this.ratesCache = {}
  this.connected = false

  if (this.autoConnect) {
    this.once('newListener', function () {
      this.connect()
    })
  }
}
inherits(WalletClient, EventEmitter)


/**
 * Login to wallet and subscribe to WebSocket notifications
 * @return {Promise<null>} Resolves once client is subscribed
 */
WalletClient.prototype.connect = function () {
  const _this = this

  if (_this.connected) {
    return Promise.resolve()
  }

  return new Promise(function (resolve, reject) {
    WalletClient._webfingerAddress(_this.address)
      .then(function (webFingerDetails) {
        _this.accountUri = webFingerDetails.ledgerAccount
        _this.socketIOUri = webFingerDetails.socketIOUri
        _this.paymentUri = webFingerDetails.paymentUri
        _this.pathfindUri = webFingerDetails.pathfindUri || _this.socketIOUri.replace('socket.io', 'payments/findPath')

        // It's important to parse the URL and pass the parts in separately
        // otherwise, socket.io thinks the path is a namespace http://socket.io/docs/rooms-and-namespaces/
        const parsed = url.parse(_this.socketIOUri)
        const host = parsed.protocol + '//' + parsed.host
        debug('Attempting to connect to wallet host: ' + host + ' path: ' + parsed.path)
        _this.socket = socket(host, { path: parsed.path })
        _this.socket.on('connect', function () {
          // If we're already connected, don't do anything here
          if (!_this.connected) {
            debug('Connected to wallet API socket.io')
            _this.socket.emit('unsubscribe', _this.username)
            _this.socket.emit('subscribe', _this.username)
            _this.connected = true
            _this.emit('connect')
            resolve()
          }
        })
        _this.socket.on('disconnect', function () {
          _this.connected = false
          debug('Disconnected from wallet')
          reject()
        })
        _this.socket.on('connect_error', function (err) {
          debug('Connection error', err, err.stack)
          reject(err)
        })
        _this.socket.on('payment', _this._handleNotification.bind(_this))
      })
      .catch(function (err) {
        debug(err)
      })
  })
}

/**
 * Check if the client is currently subscribed to wallet notifications
 * @return {Boolean}
 */
WalletClient.prototype.isConnected = function () {
  return this.connected
}

/**
 * Get the ledger account URI corresponding to the user's address
 * @return {Promise<String>}
 */
WalletClient.prototype.getAccount = function () {
  const _this = this
  if (this.accountUri) {
    return Promise.resolve(this.accountUri)
  } else {
    return new Promise(function (resolve, reject) {
      _this.once('connect', function () {
        resolve(this.accountUri)
      })
    })
  }
}

/**
 * Unsubscribe from wallet notifications
 * @return {null}
 */
WalletClient.prototype.disconnect = function () {
  this.socket.emit('unsubscribe', this.username)
}

/**
 * Create a new Payment object
 * @param  {module:Payment~PaymentParams} params Payment parameters
 * @return {module:Payment~Payment}
 */
WalletClient.prototype.payment = function (params) {
  return new Payment(this, params)
}

/**
 * Create a new Payment object, get a quote, and send the payment. Resolves when the payment is complete.
 *
 * @param  {module:Payment~PaymentParams} params Payment parameters
 * @param  {Function} [params.onQuote] Function to call when a quote is received
 * @param  {Function} [params.onSent] Function to call when payment is sent (before it is complete)
 * @return {Promise<Object>} Payment result
 */
WalletClient.prototype.send = function (params) {
  const payment = new Payment(this, params)

  if (typeof params.onQuote === 'function') {
    payment.on('quote', params.onQuote)
  }
  if (typeof params.onSent === 'function') {
    payment.on('sent', params.onSent)
  }

  return payment.quote()
    .then(function () {
      return payment.send()
    })
}

WalletClient.prototype._findPath = function (params) {
  const _this = this

  if (!_this.connected) {
    _this.connect()
    return new Promise(function (resolve, reject) {
      _this.once('connect', resolve)
    })
    .then(_this._findPath.bind(_this, params))
  }

  const pathfindParams = {
    destination: params.destinationAccount || params.destination,
    destination_amount: params.destinationAmount,
    source_amount: params.sourceAmount
  }

  debug('_findPath', pathfindParams)

  return new Promise(function (resolve, reject) {
    request.post(_this.pathfindUri)
      .auth(_this.username, _this.password)
      .send(pathfindParams)
      .end(function (err, res) {
        if (err || !res.ok) {
          return reject(err || res.body)
        }

        let result = {}
        if (!params.sourceAmount) {
          result.sourceAmount = res.body.source_amount || res.body.sourceAmount || res.body[0].source_transfers[0].debits[0].amount
        }
        if (!params.destinationAmount) {
          result.destinationAmount = res.body.destination_amount || res.body.destinationAmount || res.body[res.body.length - 1].destination_transfers[0].credits[0].amount
        }
        if (Array.isArray(res.body)) {
          result.path = res.body
        }
        resolve(result)
      })
  })
}

/**
 * Convert the given destination amount into the local asset
 * @param  {String|Number} params.destinationAmount The destination amount to convert
 * @param  {String} params.destinationAccount Destination account to convert amount for
 * @return {Promise<BigNumber>} Source amount as a [BigNumber](https://mikemcl.github.io/bignumber.js/)
 */
WalletClient.prototype.convertAmount = function (params) {
  const _this = this
  // TODO clean up this caching system
  const cacheRateThreshold = (new BigNumber(params.destinationAmount)).div(100)
  if (this.ratesCache[params.destinationAccount]) {
    const destinationAmounts = Object.keys(this.ratesCache[params.destinationAccount])
    for (let destinationAmount of destinationAmounts) {
      const cache = this.ratesCache[params.destinationAccount][destinationAmount]
      if (cache.expiresAt.isBefore(moment())) {
        delete this.ratesCache[params.destinationAccount][destinationAmount]
        continue
      }
      if ((new BigNumber(destinationAmount)).minus(params.destinationAmount).abs().lessThan(cacheRateThreshold)) {
        return Promise.resolve(cache.sourceAmount)
      }
    }
  }

  _this.findPath(params)
  .then(function (path) {
    if (Array.isArray(path) && path.length > 0) {
      // TODO update this for the latest sender
      const firstPayment = path[0]
      const sourceAmount = firstPayment.source_transfers[0].debits[0].amount
      debug(params.destinationAmount + ' on ' + path[path.length - 1].destination_transfers[0].ledger +
        ' is equivalent to ' + sourceAmount + ' on ' + firstPayment.source_transfers[0].ledger)

      // TODO cache rate by ledger instead of by account
      if (!_this.ratesCache[params.destinationAccount]) {
        _this.ratesCache[params.destinationAccount] = {}
      }
      _this.ratesCache[params.destinationAccount][params.destinationAmount] = {
        sourceAmount: new BigNumber(sourceAmount),
        expiresAt: moment().add(RATE_CACHE_REFRESH, 'milliseconds')
      }

      return sourceAmount
    } else {
      throw new Error('No path found %o', path)
    }
  })
  .catch(function (err) {
    debug('Error finding path %o %o', params, err)
    throw err
  })
}

WalletClient.prototype._sendPayment = function (params) {
  const _this = this

  if (!_this.connected) {
    _this.connect()
    return new Promise(function (resolve, reject) {
      _this.once('connect', resolve)
    })
    .then(_this._sendPayment.bind(_this, params))
  }

  let paramsToSend = {
    destination_account: params.destinationAccount || params.destination,
    destination_amount: params.destinationAmount,
    source_amount: params.sourceAmount,
    source_memo: params.sourceMemo,
    destination_memo: params.destinationMemo,
    message: params.message,
    path: params.path
  }
  if (paramsToSend.destination_amount) {
    paramsToSend.destination_amount = paramsToSend.destination_amount.toString()
  }
  if (paramsToSend.source_amount) {
    paramsToSend.source_amount = paramsToSend.source_amount.toString()
  }
  debug('_sendPayment', paramsToSend)
  return new Promise(function (resolve, reject) {
    request.put(_this.paymentUri + '/' + uuid.v4())
      .auth(_this.username, _this.password)
      .send(paramsToSend)
      .end(function (err, res) {
        if (err || !res.ok) {
          return reject(err || res.error || res.body)
        }
        resolve(res.body)
      })
  })
}

WalletClient.prototype._handleNotification = function (notification) {
  const _this = this
  debug('Got notification %o', notification)
  if (!notification) {
    return
  }

  const notificationToEmit = {
    sourceAccount: notification.source_account,
    destinationAccount: notification.destination_account,
    sourceAmount: notification.source_amount,
    destinationAmount: notification.destination_amount,
    message: notification.message
  }

  if (notification.source_account === this.accountUri) {
    this.emit('outgoing', notificationToEmit)

    if (this.listenerCount('outgoing_fulfillment') > 0) {
      Promise.all([
        this._getTransfer(notification.transfers),
        this._getTransferFulfillment(notification.transfers)
      ])
      .then(function (results) {
        _this.emit('outgoing_fulfillment', results[0], results[1])
      })
      .catch(function (err) {
        debug('Error getting outgoing_fulfillment: ' + err.message || err)
      })
    }
  } else if (notification.destination_account === this.accountUri) {
    this.emit('incoming', notificationToEmit)

    if (this.listenerCount('incoming_transfer') > 0) {
      this._getTransfer(notification.transfers)
        .then(function (transfer) {
          _this.emit('incoming_transfer', transfer)
        })
        .catch(function (err) {
          debug('Error getting incoming_transfer: ' + err.message || err)
        })
    }
  }
}

WalletClient.prototype._getTransfer = function (transferId) {
  const _this = this
  return new Promise(function (resolve, reject) {
    request.get(transferId)
      .auth(_this.username, _this.password)
      .end(function (err, res) {
        if (err) {
          return reject(err)
        }

        resolve(res.body)
      })
  })
}

WalletClient.prototype._getTransferFulfillment = function (transferId) {
  const fulfillmentUri = transferId + '/fulfillment'
  const _this = this
  return new Promise(function (resolve, reject) {
    request.get(fulfillmentUri)
      .auth(_this.username, _this.password)
      .end(function (err, res) {
        if (err) {
          return reject(err)
        }

        resolve(res.body)
      })
  })
}

  // Returns a promise that resolves to the account details
WalletClient._webfingerAddress = function (address) {
  const WebFingerConstructor = (typeof window === 'object' && window.WebFinger ? window.WebFinger : WebFinger)
  const webfinger = new WebFingerConstructor()
  return new Promise(function (resolve, reject) {
    webfinger.lookup(address, function (err, res) {
      if (err) {
        return reject(new Error('Error looking up wallet address: ' + err.message))
      }

      let webFingerDetails = {}
      try {
        for (let link of res.object.links) {
          const key = WEBFINGER_RELS[link.rel]
          if (key) {
            webFingerDetails[key] = link.href
          }
        }
      } catch (err) {
        return reject(new Error('Error parsing webfinger response' + err.message))
      }
      debug('Got webfinger response %o', webFingerDetails)
      resolve(webFingerDetails)
    })
  })
}

module.exports = WalletClient
