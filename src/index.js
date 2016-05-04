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

const RATE_CACHE_REFRESH = 60000

const WEBFINGER_RELS = {
  'https://interledger.org/rel/ledgerAccount': 'ledgerAccount',
  'https://interledger.org/rel/socketIOUri': 'socketIOUri',
  'https://interledger.org/rel/paymentUri': 'paymentUri',
  'https://interledger.org/rel/pathfindUri': 'pathfindUri'
}

/**
 * Client for connecting to the five-bells-wallet
 * @param {String} opts.address Account at five-bells-wallet in the form user@wallet-url.example
 * @param {String} opts.password Account password for five-bells-wallet
 */
function WalletClient (opts) {
  EventEmitter.call(this)

  this.address = opts.address
  this.password = opts.password

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
}
inherits(WalletClient, EventEmitter)

WalletClient.prototype.connect = function () {
  const _this = this
  return new Promise(function (resolve, reject) {
    WalletClient.webfingerAddress(_this.address)
      .then(function (webFingerDetails) {
        _this.accountUri = webFingerDetails.account
        _this.socketIOUri = webFingerDetails.socketIOUri
        _this.paymentUri = webFingerDetails.paymentUri || webFingerDetails.socketIOUri.replace('socket.io', 'payments')
        _this.pathfindUri = webFingerDetails.pathfindUri || webFingerDetails.socketIOUri.replace('socket.io', 'pathFind')

        // It's important to parse the URL and pass the parts in separately
        // otherwise, socket.io thinks the path is a namespace http://socket.io/docs/rooms-and-namespaces/
        const parsed = url.parse(_this.socketIOUri)
        const host = parsed.protocol + '//' + parsed.host
        debug('Attempting to connect to wallet host: ' + host + ' path: ' + parsed.path)
        _this.socket = socket(host, { path: parsed.path })
        _this.socket.on('connect', function () {
          debug('Connected to wallet API socket.io')
          _this.socket.emit('unsubscribe', _this.username)
          _this.socket.emit('subscribe', _this.username)
          _this.connected = true
          _this.emit('connect')
          resolve()
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

WalletClient.prototype.isConnected = function () {
  return this.connected
}

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

WalletClient.prototype.disconnect = function () {
  this.socket.emit('unsubscribe', this.username)
}

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

  const pathfindParams = {
    destination: params.destinationAccount,
    destination_amount: params.destinationAmount,
    source_amount: params.sourceAmount
  }
  return new Promise(function (resolve, reject) {
    request.post(_this.pathfindUri)
      .auth(_this.username, _this.password)
      .send(pathfindParams)
      .end(function (err, res) {
        if (err || !res.ok) {
          return reject(err || res.body)
        }
        resolve(res.body)
      })
  })
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

WalletClient.prototype.sendPayment = function (params) {
  const _this = this
  const paramsToSend = {
    destination_account: params.destinationAccount || params.destination_account,
    destination_amount: params.destinationAmount || params.destination_amount,
    source_amount: params.sourceAmount || params.source_amount,
    source_memo: params.sourceMemo || params.source_memo,
    destination_memo: params.destinationMemo || params.destination_memo
  }
  if (paramsToSend.destination_amount) {
    paramsToSend.destination_amount = paramsToSend.destination_amount.toString()
  }
  if (paramsToSend.source_amount) {
    paramsToSend.source_amount = paramsToSend.source_amount.toString()
  }
  if (_this.connected) {
    debug('sendPayment', paramsToSend)
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
  } else {
    return new Promise(function (resolve, reject) {
      _this.once('connect', resolve)
    })
    .then(_this.sendPayment.bind(_this, paramsToSend))
  }
}

WalletClient.prototype._handleNotification = function (notification) {
  const _this = this
  debug('Got notification %o', notification)
  if (!notification) {
    return
  }
  if (notification.source_account === this.accountUri) {
    this.emit('outgoing', notification)

    if (this.listenerCount('outgoing_fulfillment') > 0) {
      Promise.all([
        this.getTransfer(notification.transfers),
        this.getTransferFulfillment(notification.transfers)
      ])
      .then(function (results) {
        _this.emit('outgoing_fulfillment', results[0], results[1])
      })
      .catch(function (err) {
        debug('Error getting outgoing_fulfillment: ' + err.message || err)
      })
    }
  } else if (notification.destination_account === this.accountUri) {
    this.emit('incoming', notification)

    if (this.listenerCount('incoming_transfer') > 0) {
      this.getTransfer(notification.transfers)
        .then(function (transfer) {
          _this.emit('incoming_transfer', transfer)
        })
        .catch(function (err) {
          debug('Error getting incoming_transfer: ' + err.message || err)
        })
    }
  }
}

WalletClient.prototype.getTransfer = function (transferId) {
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

WalletClient.prototype.getTransferFulfillment = function (transferId) {
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
WalletClient.webfingerAddress = function (address) {
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
