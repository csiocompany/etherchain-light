var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');
var abi = require('ethereumjs-abi');
var abiDecoder = require('abi-decoder');




router.get('/list', function(req, res, next) {
  res.render('empty', {});
});

router.post('/list', function(req, res, next) {
    if (!req.body.accounts) {
      return res.json({ result: 'error', message: 'No accounts data specified' });
    }

    var config = req.app.get('config');  
    var web3 = new Web3();
    web3.setProvider(config.provider);

    var p_accounts = req.body.accounts;

    web3.eth.getBlock("latest", false, function(err, result) {
        var lastBlock = result;

        var p_fromBlock = result.number - 500;

        if (req.body.fromBlock) {
          p_fromBlock = req.body.fromBlock;
        }

        web3.trace.filter({ "fromBlock": "0x" + p_fromBlock.toString(16), "fromAddress": p_accounts }, function(err, sent) {
           web3.trace.filter({ "fromBlock": "0x" + p_fromBlock.toString(16), "toAddress": p_accounts }, function(err, received) {

          // Add Blocks
            var blockNums = [];

            sent.forEach(function(item) {
              if (blockNums.indexOf(item['blockNumber']) == -1) {
                blockNums.push(item['blockNumber']);
              }
            });
            received.forEach(function(item) {
              if (blockNums.indexOf(item['blockNumber']) == -1) {
                blockNums.push(item['blockNumber']);
              }
            });

            var size = blockNums.length,
                count = 0,
                arrBlocks = {};
            blockNums.forEach(function(item) {
              web3.eth.getBlock(item, false, function(err, result) {
                arrBlocks[result.number] = result;

                count++;

                if (count == size) {
                  res.json({
                    result: 'ok',
                    data: {
                      latest: lastBlock,
                      sent: sent,
                      received: received,
                      blocks: arrBlocks
                    }
                  });
                }
              });
            });
          // Add Blocks

            /*res.json({
              result: 'ok',
              data: {
                sent: sent,
                received: received
              }
            });*/
          });
        });
    });
});



router.get('/pending', function(req, res, next) {
  
  var config = req.app.get('config');  
  var web3 = new Web3();
  web3.setProvider(config.provider);

  var q_format = req.query.format;
  
  async.waterfall([
    function(callback) {
      web3.parity.pendingTransactions(function(err, result) {
        callback(err, result);
      });
    }
  ], function(err, txs) {
    if (err) {
      return next(err);
    }
    
    if (q_format == 'json') {
      res.json({ txs: txs });
    }
    else {
      res.render('tx_pending', { txs: txs });
    }
  });
});


router.get('/submit', function(req, res, next) {  
  res.render('tx_submit', { });
});

router.post('/submit', function(req, res, next) {
  var p_format = req.body.format;

  if (!req.body.txHex) {
    if (p_format == 'json') {
      return res.json({ result: 'error', message: "No transaction data specified" });
    }
    else {
      return res.render('tx_submit', { message: "No transaction data specified"});
    }
  }
  
  var config = req.app.get('config');  
  var web3 = new Web3();
  web3.setProvider(config.provider);
  
  async.waterfall([
    function(callback) {
      web3.eth.sendRawTransaction(req.body.txHex, function(err, result) {
        callback(err, result);
      });
    }
  ], function(err, hash) {
    if (err) {
      if (p_format == 'json') {
        res.json({ result: 'error', message: "Error submitting transaction: " + err });
      }
      else {
        res.render('tx_submit', { message: "Error submitting transaction: " + err });
      }
    } else {
      if (p_format == 'json') {
        res.json({ result: 'ok', hash: hash });
      }
      else {
        res.render('tx_submit', { message: "Transaction submitted. Hash: " + hash });
      }
    }
  });
});

router.get('/:tx', function(req, res, next) {
  
  var config = req.app.get('config');  
  var web3 = new Web3();
  web3.setProvider(config.provider);
  
  var db = req.app.get('db');

  var q_format = req.query.format;
  
  async.waterfall([
    function(callback) {
      web3.eth.getTransaction(req.params.tx, function(err, result) {
        callback(err, result);
      });
    }, function(result, callback) {
      
      if (!result || !result.hash) {
        return callback({ message: "Transaction hash not found" }, null);
      }
      
      web3.eth.getTransactionReceipt(result.hash, function(err, receipt) {
        callback(err, result, receipt);
      });
    }, function(tx, receipt, callback) {  
      web3.trace.transaction(tx.hash, function(err, traces) {
        callback(err, tx, receipt, traces);
      });
    }, function(tx, receipt, traces, callback) {
      db.get(tx.to, function(err, value) {
        callback(null, tx, receipt, traces, value);
      });
    }
  ], function(err, tx, receipt, traces, source) {
    if (err) {
      return next(err);
    }
     
    // Try to match the tx to a solidity function call if the contract source is available
    if (source) {
      tx.source = JSON.parse(source);
      try {
        var jsonAbi = JSON.parse(tx.source.abi);
        abiDecoder.addABI(jsonAbi);
        tx.logs = abiDecoder.decodeLogs(receipt.logs);
        tx.callInfo = abiDecoder.decodeMethod(tx.input);
      } catch (e) {
        console.log("Error parsing ABI:", tx.source.abi, e);
      }
    }
    tx.traces = [];
    tx.failed = false;
    tx.gasUsed = 0;
    if (traces != null) {
    traces.forEach(function(trace) {
        tx.traces.push(trace);
        if (trace.error) {
          tx.failed = true;
          tx.error = trace.error;
        }
        if (trace.result && trace.result.gasUsed) {
          tx.gasUsed += parseInt(trace.result.gasUsed, 16);
        }
      });
    }
    // console.log(tx.traces); 

    if (q_format == 'json') {
      res.json({ tx: tx });
    }
    else {
      res.render('tx', { tx: tx });
    }
  });
  
});

router.get('/raw/:tx', function(req, res, next) {
  
  var config = req.app.get('config');  
  var web3 = new Web3();
  web3.setProvider(config.provider);

  var q_format = req.query.format;
  
  async.waterfall([
    function(callback) {
      web3.eth.getTransaction(req.params.tx, function(err, result) {
        callback(err, result);
      });
    }, function(result, callback) {
      web3.trace.replayTransaction(result.hash, ["trace", "stateDiff", "vmTrace"], function(err, traces) {
        callback(err, result, traces);
      });
    }
  ], function(err, tx, traces) {
    if (err) {
      return next(err);
    }
    
    tx.traces = traces;

    if (q_format == 'json') {
      res.json({ tx: tx });
    }
    else {
      res.render('tx_raw', { tx: tx });
    }
  });
});

module.exports = router;
