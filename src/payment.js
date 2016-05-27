'use strict'

const EventEmitter = require('events').EventEmitter
const inherits = require('inherits')

/**
 * Class for quoting and sending payments
 * @module  Payment
 */

/**
 * @typedef {Object} PaymentParams
 * @param {String} destinationAccount Receiver account URI
 * @param {String|Number|BigNumber} [sourceAmount=(quoted from destinationAmount)] Either sourceAmount or destinationAmount must be supplied
 * @param {String|Number|BigNumber} [destinationAmount=(quoted from sourceAmount)] Either sourceAmount or destinationAmount must be supplied
 * @param {String} [message=""] Message to send to recipient
 */

/**
 * Quote event
 * @event Payment#quote
 * @type {Payment~PaymentParams}
 */

/**
 * Payment sent event
 * @event Payment#sent
 * @type {Object} Payment result
 */

/**
 * @class
 * @param {WalletClient} walletClient - WalletClient instance used for quoting and sending
 * @param {module:Payment~PaymentParams} params - Payment parameters
 */
function Payment (walletClient, params) {
  EventEmitter.call(this)

  this.walletClient = walletClient
  this.params = params
}
inherits(Payment, EventEmitter)

/**
 * Get a quote to fill in either the sourceAmount or destinationAmount, whichever was not given.
 * @fires Payment#quote
 * @return {Promise<module:Payment~PaymentParams>} Original payment params with sourceAmount or destinationAmount filled in
 */
Payment.prototype.quote = function () {
  const _this = this
  return this.walletClient._findPath(this.params)
    .then(function (result) {
      if (!_this.params.sourceAmount) {
        // TODO the result will be made more consistent when the wallet is updated to the latest connector
        _this.params.sourceAmount = result.sourceAmount
      }
      if (!_this.params.destinationAmount) {
        _this.params.destinationAmount = result.destinationAmount
      }

      _this.params.path = result.path

      _this.emit('quote', _this.params)
      return _this.params
    })
}

/**
 * Execute the payment
 * @fires Payment#sent
 * @return {Promise<Object>} Resolves when the payment is complete
 */
Payment.prototype.send = function () {
  const _this = this
  return this.walletClient._sendPayment(this.params)
    .then(function (result) {
      _this.emit('sent', result)
      _this.result = result
      return result
    })
}

exports.Payment = Payment
