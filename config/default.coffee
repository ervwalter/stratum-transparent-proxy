module.exports = {
	name: 'stratum-proxy'
	pools: [
		{
			host: 'stratum.btcguild.com'
			port: 3333
			listenPort: 7001
			userMappings: {
				'username': 'devicename'
			}
		}
	]
	key: 'secret'
	servers: [
		'http://localhost:3000'
	]
}