// Generated by CoffeeScript 1.6.3
(function() {
  var carrier, cleanup, clients, config, counter, hostname, jobs, moment, net, os, pendingShares, pool, request, server, _fn, _i, _j, _len, _len1, _ref, _ref1;

  net = require('net');

  carrier = require('carrier');

  moment = require('moment');

  config = require('config');

  os = require('os');

  request = require('request-json');

  counter = 0;

  jobs = {};

  pendingShares = {};

  hostname = os.hostname();

  clients = [];

  _ref = config.servers;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    server = _ref[_i];
    clients.push(request.newClient(server));
  }

  _ref1 = config.pools;
  _fn = function(pool) {
    server = net.createServer(function(source) {
      counter++;
      return (function(counter) {
        var clientAddress, currentDifficulty, destination, log, parseRequest, parseResponse;
        currentDifficulty = 1;
        log = function(source, message) {
          return console.log("" + (moment().format('HH:mm:ss')) + " [" + pool.host + ":" + counter + "] " + source + ": " + message);
        };
        parseRequest = function(line) {
          var err, job, jobId, requestId, share;
          try {
            request = JSON.parse(line);
          } catch (_error) {
            err = _error;
          }
          try {
            switch (request.method) {
              case 'mining.submit':
                jobId = "" + counter + ":" + request.params[1];
                requestId = "" + counter + ":" + request.id;
                job = jobs[jobId];
                if (job == null) {
                  log('client', "unknown job (" + jobId + ")");
                  return;
                }
                share = {
                  username: request.params[0],
                  targetDifficulty: job.targetDifficulty,
                  uniqueKey: request.params[4] + request.params[3] + request.params[2],
                  expires: moment().add('minutes', 5).unix()
                };
                return pendingShares[requestId] = share;
            }
          } catch (_error) {
            err = _error;
            return log('client', err.message);
          }
        };
        parseResponse = function(line) {
          var client, err, job, jobId, pendingShare, requestId, response, share, _k, _len2;
          try {
            response = JSON.parse(line);
          } catch (_error) {
            err = _error;
          }
          try {
            switch (response.method) {
              case 'mining.set_difficulty':
                currentDifficulty = response.params[0];
                log('server', "new difficulty: " + currentDifficulty);
                return;
              case 'mining.notify':
                jobId = "" + counter + ":" + response.params[0];
                job = {
                  targetDifficulty: currentDifficulty,
                  expires: moment().add('hours', 1).unix()
                };
                jobs[jobId] = job;
                return;
            }
            if (response.id != null) {
              requestId = "" + counter + ":" + response.id;
              pendingShare = pendingShares[requestId];
              if (pendingShare) {
                delete pendingShares[requestId];
                share = {
                  hostname: config.name || hostname,
                  timestamp: moment().unix(),
                  result: response.result ? 'accept' : 'reject',
                  targetDifficulty: pendingShare.targetDifficulty,
                  pool: "http://" + pool.host + ":" + pool.port,
                  device: (pool != null ? pool.userMappings[pendingShare.username] : void 0) || pendingShare.username,
                  shareHash: pendingShare.uniqueKey
                };
                log('client', "" + share.result + "ed share for " + share.device + ", diff " + pendingShare.targetDifficulty + ", " + pendingShare.uniqueKey);
                for (_k = 0, _len2 = clients.length; _k < _len2; _k++) {
                  client = clients[_k];
                  client.post("/submitshare?key=" + config.key, share, function() {});
                }
              } else {

              }
            }
          } catch (_error) {
            err = _error;
            return log('server', err.message);
          }
        };
        clientAddress = source.remoteAddress;
        log('client', "connection opened from " + clientAddress);
        return destination = net.connect(pool.port, pool.host, function() {
          var closeConnections, destinationReader, sourceReader;
          log('server', "connected to " + pool.host + ":" + pool.port);
          closeConnections = function() {
            var e;
            try {
              destination.end();
            } catch (_error) {
              e = _error;
            }
            try {
              return source.end();
            } catch (_error) {
              e = _error;
            }
          };
          source.on('end', function() {
            log('client', "connection from " + clientAddress + " closed");
            return closeConnections();
          });
          destination.on('end', function() {
            log('server', "connection to " + pool.host + ":" + pool.port + " closed");
            return closeConnections();
          });
          source.on('error', function(err) {
            log('client', "error: (" + err.message + ")");
            return closeConnections();
          });
          destination.on('error', function(err) {
            log('server', "error: (" + err.message + ")");
            return closeConnections();
          });
          sourceReader = carrier.carry(source);
          destinationReader = carrier.carry(destination);
          sourceReader.on('line', function(line) {
            setImmediate(function() {
              return parseRequest(line);
            });
            return destination.write(line + '\n');
          });
          return destinationReader.on('line', function(line) {
            setImmediate(function() {
              return parseResponse(line);
            });
            return source.write(line + '\n');
          });
        });
      })(counter);
    });
    server.listen(pool.listenPort);
    return console.log("" + (moment().format('HH:mm:ss')) + " Starting proxy for " + pool.host + ":" + pool.port + " on port " + pool.listenPort);
  };
  for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
    pool = _ref1[_j];
    _fn(pool);
  }

  cleanup = function() {
    var count, job, jobId, now, requestId, share;
    now = moment().unix();
    count = 0;
    for (jobId in jobs) {
      job = jobs[jobId];
      if (now > job.expires) {
        delete jobs[jobId];
        count++;
      }
    }
    console.log("" + (moment().format('HH:mm:ss')) + " Cleaned up " + count + " old jobs.");
    count = 0;
    for (requestId in pendingShares) {
      share = pendingShares[requestId];
      if (now > share.expires) {
        delete pendingShares[requestId];
        count++;
      }
    }
    return console.log("" + (moment().format('HH:mm:ss')) + " Cleaned up " + count + " orphaned pending shares.");
  };

  setInterval(cleanup, 300000);

}).call(this);

/*
//@ sourceMappingURL=server.map
*/
