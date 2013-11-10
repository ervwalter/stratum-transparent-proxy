net = require('net')
carrier = require('carrier')
moment = require('moment')
config = require('config')
os = require('os')
request = require('request-json')

counter = 0

jobs = {}
pendingShares = {}

hostname = os.hostname()
clients = []
clients.push request.newClient(server) for server in config.servers

for pool in config.pools
	do (pool) ->
		server = net.createServer (source) ->
			counter++
			do (counter) ->
				currentDifficulty = 1

				log = (source, message) ->
					console.log "#{moment().format('HH:mm:ss')} [#{pool.host}:#{counter}] #{source}: #{message}"

				parseRequest = (line) ->
					try
						request = JSON.parse(line)
					catch err

					try
						switch request.method
							when 'mining.authorize'
								device = pool.devices?[request.params[0]]
								if device?
									request.params[0] = device.username
									request.params[1] = device.password
									line = JSON.stringify(request)
							when 'mining.submit'
								# first, translate the username
								deviceName = request.params[0]
								device = pool.devices?[deviceName]
								if device?
									request.params[0] = device.username
									line = JSON.stringify(request)
								# next, track the submission
								jobId = "#{counter}:#{request.params[1]}"
								requestId = "#{counter}:#{request.id}"
								job = jobs[jobId]
								unless job?
									log 'client', "unknown job (#{jobId})"
									return line
								share = {
									device: deviceName
									targetDifficulty: job.targetDifficulty
									uniqueKey: request.params[4] + request.params[3] + request.params[2]
									expires: moment().add('minutes', 5).unix()
								}
								pendingShares[requestId] = share
					catch err
						log 'client', err.message

					return line

				parseResponse = (line) ->
					try
						response = JSON.parse(line)
					catch err
					try
						switch response.method
							when 'mining.set_difficulty'
								currentDifficulty = response.params[0]
								log 'server', "new difficulty: #{currentDifficulty}"
								return
							when 'mining.notify'
								jobId = "#{counter}:#{response.params[0]}"
								job = {
									targetDifficulty: currentDifficulty
									expires: moment().add('hours', 1).unix()
								}
								jobs[jobId] = job
								#log 'server', "new job (#{jobId}), diff #{job.targetDifficulty}"
								return
						if response.id?
							requestId = "#{counter}:#{response.id}"
							pendingShare = pendingShares[requestId]
							if pendingShare
								delete pendingShares[requestId]
								share = {
									hostname: config.name or hostname
									timestamp: moment().unix()
									result: if response.result then 'accept' else 'reject'
									targetDifficulty: pendingShare.targetDifficulty
									pool: "http://#{pool.host}:#{pool.port}"
									device: pendingShare.device
									shareHash: pendingShare.uniqueKey
								}
								log 'client', "#{share.result}ed share for #{share.device}, diff #{pendingShare.targetDifficulty}, #{pendingShare.uniqueKey}"
								for client in clients
									client.post "/submitshare?key=#{config.key}", share, ->
								return
							else
								#log 'server', 'other response received'
								return
					catch err
						log 'server', err.message

				clientAddress = source.remoteAddress
				log 'client', "connection opened from #{clientAddress}"

				destination = net.connect pool.port, pool.host, ->
					log 'server', "connected to #{pool.host}:#{pool.port}"

					closeConnections = ->
						try
							destination.end()
						catch e
						try
							source.end()
						catch e

					source.on 'end', ->  log 'client', "connection from #{clientAddress} closed"; closeConnections();
					destination.on 'end', ->  log 'server', "connection to #{pool.host}:#{pool.port} closed"; closeConnections();
					source.on 'error', (err) ->  log 'client', "error: (#{err.message})"; closeConnections();
					destination.on 'error', (err) ->  log 'server', "error: (#{err.message})"; closeConnections();

					sourceReader = carrier.carry(source)
					destinationReader = carrier.carry(destination)

					sourceReader.on 'line', (line) ->
						#log 'client', line
						line = parseRequest(line)
						destination.write line + '\n'

					destinationReader.on 'line', (line) ->
						#log 'server', line
						setImmediate -> parseResponse(line)
						source.write line + '\n'

		server.listen(pool.listenPort)
		console.log "#{moment().format('HH:mm:ss')} Starting proxy for #{pool.host}:#{pool.port} on port #{pool.listenPort}"

cleanup = ->
	now = moment().unix()
	#purse old jobs
	count = 0
	for jobId of jobs
		job = jobs[jobId]
		if now > job.expires
			delete jobs[jobId]
			count++
	console.log "#{moment().format('HH:mm:ss')} Cleaned up #{count} old jobs."
	count = 0
	for requestId of pendingShares
		share = pendingShares[requestId]
		if now > share.expires
			delete pendingShares[requestId]
			count++
	console.log "#{moment().format('HH:mm:ss')} Cleaned up #{count} orphaned pending shares."

setInterval cleanup, 300000 # every 5 minutes purge old stuff