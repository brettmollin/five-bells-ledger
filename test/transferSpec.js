/*global describe, it*/
'use strict';
const _ = require('lodash');
const expect = require('chai').expect;
const app = require('../app');
const db = require('../services/db');
const dbHelper = require('./helpers/db');
const appHelper = require('./helpers/app');
const logHelper = require('./helpers/log');

describe('Transfers', function () {
  logHelper();

  beforeEach(function *() {
    appHelper.create(this, app);

    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transfer1'));
    this.existingTransfer = _.cloneDeep(require('./data/transfer2'));

    // Reset database
    yield dbHelper.reset();

    // Store some example data
    yield db.put(['people'], require('./data/people'));
    yield db.create(['transfers'], this.existingTransfer);
  });

  describe('GET /transfers/:uuid', function () {
    it('should return 200', function *() {
      const transfer = this.formatId(this.existingTransfer, '/transfers/');
      yield this.request()
        .get('/transfers/' + this.existingTransfer.id)
        .expect(200)
        .expect(transfer)
        .end();
    });

    it('should return 404 when the transfer does not exist', function *() {
      yield this.request()
        .get('/transfers/' + this.exampleTransfer.id)
        .expect(404)
        .end();
    });
  });

  describe('PUT /transfers/:uuid', function () {
    it('should return 201', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();

      // Check balances
      expect(yield db.get(['people', 'alice', 'balance'])).to.equal(90);
      expect(yield db.get(['people', 'bob', 'balance'])).to.equal(10);
    });

    it('should return 201 if the transfer does not have an ID set', function *() {
      const transferWithoutId = _.cloneDeep(this.exampleTransfer);
      delete transferWithoutId.id;
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithoutId)
        .expect(201)
        .expect(_.assign({}, this.formatId(this.exampleTransfer, '/transfers/'),
                {state: 'completed'}))
        .end();

      // Check balances
      expect(yield db.get(['people', 'alice', 'balance'])).to.equal(90);
      expect(yield db.get(['people', 'bob', 'balance'])).to.equal(10);
    });

    it('should trigger subscriptions', function *() {
      const subscription = require('./data/subscription1.json');
      yield db.create(['people', subscription.owner, 'subscriptions', subscription.id],
                      subscription);

      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();

      // TODO: Expect subscription to trigger
    });

    it('should return 400 if the transfer ID is invalid', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      delete transfer.id;
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id + 'bogus')
        .send(transfer)
        .expect(400)
        .end();
    });

    it('should return 400 if the transfer is invalid', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.source_funds[0].amount = 'bogus';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(400)
        .end();
    });

    it('should return 200 if the transfer already exists', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();
    });

    it('should return 422 if the source amount is zero', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.source_funds[0].amount = '0';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the destination amount is zero', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.destination_funds[0].amount = '0';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the sender doesn\'t have enough money', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.source_funds[0].amount = '101';
      transfer.destination_funds[0].amount = '101';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the sender doesn\'t exist', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.source_funds[0].account = 'alois';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the recipient doesn\'t exist', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.destination_funds[0].account = 'blob';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        // .expect(422)
        .end();
    });

    it('should return 422 if source and destination amounts don\'t match', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.destination_funds[0].amount = '122';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        // .expect(422)
        .end();
    });

    it('should return 403 if the request is unauthorized');
    it('should return 403 if the authorization is forged');
    it('should return 403 if the authorization is not applicable');

    it('should set the transfer state to "proposed" if no authorization is given', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      const transferWithoutAuthorization = _.cloneDeep(transfer);
      delete transferWithoutAuthorization.source_funds[0].authorization;

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {state: 'proposed'}))
        .end();
    });

    it('should update the state from "proposed" to "completed" when authorization is added and ' +
       'no execution condition is given', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');

      const transferWithoutAuthorization = _.cloneDeep(transfer);
      delete transferWithoutAuthorization.source_funds[0].authorization;

      const transferWithAuthorization = _.cloneDeep(transfer);

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {state: 'proposed'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithAuthorization)
        .expect(200)
        .expect(_.assign({}, transferWithAuthorization, {state: 'completed'}))
        .end();
    });

    it('should update the state from "proposed" to "prepared" when authorization is added and an ' +
       'execution condition is present', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');

      const transferWithoutAuthorization = _.cloneDeep(transfer);
      delete transferWithoutAuthorization.source_funds[0].authorization;
      transferWithoutAuthorization.execution_condition = {
        message: 'test',
        signer: 'blah'
      };

      const transferWithAuthorization = _.cloneDeep(transfer);
      transferWithAuthorization.execution_condition = {
        message: 'test',
        signer: 'blah'
      };

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {state: 'proposed'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithAuthorization)
        .expect(200)
        .expect(_.assign({}, transferWithAuthorization, {state: 'prepared'}))
        .end();
    });

    it('should update the state from "prepared" to "completed" when the execution criteria is met',
       function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');

      const transferWithoutAuthorization = _.cloneDeep(transfer);
      transferWithoutAuthorization.execution_condition = {
        message: 'test',
        signer: 'blah'
      };

      const transferWithAuthorization = _.cloneDeep(transfer);
      transferWithAuthorization.execution_condition = {
        message: 'test',
        signer: 'blah'
      };
      transferWithAuthorization.execution_condition_fulfillment = {};

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {state: 'prepared'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithAuthorization)
        .expect(200)
        .expect(_.assign({}, transferWithAuthorization, {state: 'completed'}))
        .end();
    });
  });
});
