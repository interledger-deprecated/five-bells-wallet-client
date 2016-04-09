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
    this.walletSocketIoUri = null
    // TODO get the username from the WebFinger results
    this.username = opts.address.split('@')[0]
    this.socket = null
    // <destinationAccount>: { <destinationAmount>: { sourceAmount: 10, expiresAt: '<date>' } }
    this.ratesCache = {}
    this.ready = false
  }

  connect () {
    const _this = this
    debug('Account address:', this.address)
    return WalletClient.webfingerAddress(this.address)
      .then(({ account, socketIOUri }) => {
        _this.account = account
        _this.walletSocketIoUri = socketIOUri

        // It's important to parse the URL and pass the parts in separately
        // otherwise, socket.io thinks the path is a namespace http://socket.io/docs/rooms-and-namespaces/
        const parsed = url.parse(_this.walletSocketIoUri)
        const host = parsed.protocol + '//' + parsed.host
        debug('Attempting to connect to wallet host: ' + host + ' path: ' + parsed.path)
        _this.socket = socket(host, { path: parsed.path })
        _this.socket.on('connect', () => {
          debug('Connected to wallet API socket.io')
          _this.socket.emit('unsubscribe', _this.username)
          _this.socket.emit('subscribe', _this.username)
          _this.ready = true
          _this.emit('ready')
        })
        _this.socket.on('disconnect', () => {
          _this.ready = false
          debug('Disconnected from wallet')
        })
        _this.socket.on('connect_error', (err) => {
          debug('Connection error', err, err.stack)
        })
        _this.socket.on('payment', _this._handleNotification.bind(_this))
      })
      .catch((err) => {
        debug(err)
      })
  }

  disconnect () {
    this.socket.emit('unsubscribe', this.username)
  }

  normalizeAmount (params) {
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
    const paramsToSend = {
      ...params,
      sourceAccount: this.account,
      sourcePassword: this.password
    }
    debug('sendPayment', paramsToSend)
    if (this.ready) {
      return sendPayment(paramsToSend)
    } else {
      return new Promise((resolve, reject) => {
        this.once('ready', resolve)
      })
        .then(() => {
          return sendPayment(paramsToSend)
        })
    }
  }

  _handleNotification (payment) {
    const _this = this
    if (payment.transfers) {
      request.get(payment.transfers)
        .auth(_this.username, _this.password)
        .end((err, res) => {
          if (err) {
            debug('Error getting transfer', err)
            return
          }
          const transfer = res.body
          debug('got notification of transfer ' + payment.transfers, transfer)
          if (transfer.state === 'executed') {
            // Look for incoming credits or outgoing debits involving us
            for (let credit of transfer.credits) {
              if (credit.account === this.account) {
                _this.emit('incoming', credit)
              }
            }
            // Look for outgoing transfers that were executed
            for (let debit of transfer.debits) {
              if (debit.account === this.account) {
                request.get(transfer.id + '/fulfillment')
                  .auth(_this.username, _this.password)
                  .end((err, res) => {
                    if (err) {
                      debug('Error getting transfer fulfillment', err)
                      return
                    }

                    const fulfillment = res.body
                    _this.emit('outgoing_executed', debit, fulfillment)
                  })
              }
            }
          } else if (transfer.state === 'rejected') {
            // TODO use notification of outgoing payments being rejected to subtract from amount sent to peer
            for (let debit of transfer.debits) {
              if (debit.account === this.account) {
                _this.emit('outgoing_rejected', debit)
              }
            }
          }
        })
    }
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
