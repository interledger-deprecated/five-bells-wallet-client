'use strict'

import socket from 'socket.io-client'
import { EventEmitter } from 'events'
import sendPayment, { findPath } from 'five-bells-sender'
import request from 'superagent'
import WebFinger from 'webfinger.js'
import Debug from 'debug'
const debug = Debug('WalletClient')
import moment from 'moment'
import BigNumber from 'bignumber.js'
import url from 'url'

const RATE_CACHE_REFRESH = 60000

/**
 * Client for connecting to the five-bells-wallet
 * @param {String} opts.address Account at five-bells-wallet in the form user@wallet-url.example
 * @param {String} opts.password Account password for five-bells-wallet
 */
export default class WalletClient extends EventEmitter {
  constructor (opts) {
    super()

    this.address = opts.address
    this.password = opts.password

    if (!this.address) {
      throw new Error('Must instantiate WalletClient with five-bells-wallet address')
    }
    if (!this.password) {
      throw new Error('Must instantiate WalletClient with five-bells-wallet password')
    }

    this.account = null
    this.socketIOUri = null
    // TODO get the username from the WebFinger results
    this.username = opts.address.split('@')[0]
    this.socket = null
    // <destinationAccount>: { <destinationAmount>: { sourceAmount: 10, expiresAt: '<date>' } }
    this.ratesCache = {}
    this.connected = false
  }

  connect () {
    const _this = this
    return new Promise(function (resolve, reject) {
      WalletClient.webfingerAddress(_this.address)
        .then(({ account, socketIOUri }) => {
          _this.account = account
          _this.socketIOUri = socketIOUri

          // It's important to parse the URL and pass the parts in separately
          // otherwise, socket.io thinks the path is a namespace http://socket.io/docs/rooms-and-namespaces/
          const parsed = url.parse(_this.socketIOUri)
          const host = parsed.protocol + '//' + parsed.host
          debug('Attempting to connect to wallet host: ' + host + ' path: ' + parsed.path)
          _this.socket = socket(host, { path: parsed.path })
          _this.socket.on('connect', () => {
            debug('Connected to wallet API socket.io')
            _this.socket.emit('unsubscribe', _this.username)
            _this.socket.emit('subscribe', _this.username)
            _this.connected = true
            _this.emit('connect')
            resolve()
          })
          _this.socket.on('disconnect', () => {
            _this.connected = false
            debug('Disconnected from wallet')
            reject()
          })
          _this.socket.on('connect_error', (err) => {
            debug('Connection error', err, err.stack)
            reject(err)
          })
          _this.socket.on('payment', _this._handleNotification.bind(_this))
        })
        .catch((err) => {
          debug(err)
        })
    })
  }

  isConnected () {
    return this.connected
  }

  getAccount () {
    const _this = this
    if (this.account) {
      return Promise.resolve(this.account)
    } else {
      return new Promise((resolve, reject) => {
        _this.once('connect', () => {
          resolve(this.account)
        })
      })
    }
  }

  disconnect () {
    this.socket.emit('unsubscribe', this.username)
  }

  convertAmount (params) {
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

    return findPath({
      ...params,
      sourceAccount: this.account
    })
    .then((path) => {
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
    .catch((err) => {
      debug('Error finding path %o %o', params, err)
      throw err
    })
  }

  sendPayment (params) {
    const _this = this
    return Promise.resolve()
      .then(() => {
        if (params.destinationAccount.indexOf('@') === -1) {
          return params
        } else {
          return WalletClient.webfingerAddress(params.destinationAccount)
            .then(({ account }) => ({
              ...params,
              destinationAccount: account
            }))
        }
      })
      .then((params) => {
        const paramsToSend = {
          ...params,
          sourceAccount: _this.account,
          sourcePassword: _this.password
        }
        debug('sendPayment', paramsToSend)
        if (_this.connected) {
          return sendPayment(paramsToSend)
        } else {
          return new Promise((resolve, reject) => {
            _this.once('connect', resolve)
          })
            .then(() => {
              return sendPayment(paramsToSend)
            })
        }
      })
  }

  _handleNotification (notification) {
    const _this = this
    if (notification.source_account === this.account) {
      this.emit('outgoing', notification)

      if (this.listenerCount('outgoing_fulfillment') > 0) {
        Promise.all([
          this.getTransfer(notification.transfers),
          this.getTransferFulfillment(notification.transfers)
        ])
        .then((results) => {
          _this.emit('outgoing_fulfillment', results[0], results[1])
        })
        .catch((err) => {
          debug('Error getting outgoing_fulfillment: ' + err.message || err)
        })
      }
    } else if (notification.destination_account === this.account) {
      this.emit('incoming', notification)

      if (this.listenerCount('incoming_transfer') > 0) {
        this.getTransfer(notification.transfers)
          .then((transfer) => {
            _this.emit('incoming_transfer', transfer)
          })
          .catch((err) => {
            debug('Error getting incoming_transfer: ' + err.message || err)
          })
      }
    }
  }

  getTransfer (transferId) {
    const _this = this
    return new Promise((resolve, reject) => {
      request.get(transferId)
        .auth(_this.username, _this.password)
        .end((err, res) => {
          if (err) {
            return reject(err)
          }

          resolve(res.body)
        })
    })
  }

  getTransferFulfillment (transferId) {
    const fulfillmentUri = transferId + '/fulfillment'
    const _this = this
    return new Promise((resolve, reject) => {
      request.get(fulfillmentUri)
        .auth(_this.username, _this.password)
        .end((err, res) => {
          if (err) {
            return reject(err)
          }

          resolve(res.body)
        })
    })
  }

  // Returns a promise that resolves to the account details
  static webfingerAddress (address) {
    const WebFingerConstructor = (typeof window === 'object' && window.WebFinger ? window.WebFinger : WebFinger)
    const webfinger = new WebFingerConstructor()
    return new Promise((resolve, reject) => {
      webfinger.lookup(address, (err, res) => {
        if (err) {
          return reject(new Error('Error looking up wallet address: ' + err.message))
        }

        let webFingerDetails = {}
        try {
          for (let link of res.object.links) {
            if (link.rel === 'http://webfinger.net/rel/ledgerAccount') {
              webFingerDetails.account = link.href
            } else if (link.rel === 'http://webfinger.net/rel/socketIOUri') {
              webFingerDetails.socketIOUri = link.href
            }
          }
        } catch (err) {
          return reject(new Error('Error parsing webfinger response' + err.message))
        }
        resolve(webFingerDetails)
      })
    })
  }

}
