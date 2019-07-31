var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');





router.get('/balance', function(req, res, next) {
  res.render('empty', {});
});

router.post('/balance', function(req, res, next) {
  if (!req.body.accounts) {
    return res.json({ result: 'error', message: "No accounts data specified" });
  }

  var config = req.app.get('config');  
  var web3 = new Web3();
  web3.setProvider(config.provider);
  
  var p_accounts = req.body.accounts;
  var data = {};
  var size = p_accounts.length;


  for (var i in p_accounts) {
    web3.eth.getBalance(p_accounts[i], function(err, balance) {
      balances[p_accounts[i]] = balance.toNumber();

      if (i == size) {
        res.json({
          result: 'ok',
          data: balances
        });
      }
    });
  }


  /*async.waterfall([
    function(callback) {
      var balances = {};

      for (var i in p_accounts) {
        balances[p_accounts[i]] = web3.eth.getBalance(p_accounts[i]);
      }

      callback(balances);
    }
  ], function(balances) {
    data.balances = balances;
    
    res.json(data);
  });*/
});






router.get('/:offset?', function(req, res, next) {
  var config = req.app.get('config');  
  var web3 = new Web3();
  web3.setProvider(config.provider);
  
  async.waterfall([
    function(callback) {
      web3.parity.listAccounts(20, req.params.offset, function(err, result) {
        callback(err, result);
      });
    }, function(accounts, callback) {
      
      var data = {};
      
      if (!accounts) {
        return callback({name:"FatDBDisabled", message: "Parity FatDB system is not enabled. Please restart Parity with the --fat-db=on parameter."});
      }
      
      if (accounts.length === 0) {
        return callback({name:"NoAccountsFound", message: "Chain contains no accounts."});
      }
      
      var lastAccount = accounts[accounts.length - 1];
      
      async.eachSeries(accounts, function(account, eachCallback) {
        web3.eth.getCode(account, function(err, code) {
          if (err) {
            return eachCallback(err);
          }
          data[account] = {};
          data[account].address = account;
          data[account].type = code.length > 2 ? "Contract" : "Account";
          
          web3.eth.getBalance(account, function(err, balance) {
            if (err) {
              return eachCallback(err);
            }
            data[account].balance = balance;
            eachCallback();
          });
        });
      }, function(err) {
        callback(err, data, lastAccount);
      });
    }
  ], function(err, accounts, lastAccount) {
    if (err) {
      return next(err);
    }
    
    res.render("accounts", { accounts: accounts, lastAccount: lastAccount });
  });
});

module.exports = router;
