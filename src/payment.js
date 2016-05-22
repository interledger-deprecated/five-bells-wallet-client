'use strict'

const EventEmitter = require('events').EventEmitter
const inherits = require('inherits')

function Payment (walletClient, params) {
  EventEmitter.call(this)

  this.walletClient = walletClient
  this.params = params
}
inherits(Payment, EventEmitter)

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

Payment.prototype.send = function () {
  const _this = this
  return this.walletClient._sendPayment(this.params)
    .then(function (result) {
      _this.emit('sent', result)
      _this.result = result
      return _this
    })
}

exports.Payment = Payment
