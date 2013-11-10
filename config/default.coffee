module.exports = {
	name: 'stratum-proxy'
	pools: [
		{
			host: 'btcguild-private'
			port: 3333
			listenPort: 7001
			devices: {
				'devicename1' : { username: 'pool_username', password: 'pool_password' }
				'devicename2' : { username: 'pool_username', password: 'pool_password' }
			}
		}
	]
	key: 'secret'
	servers: [
		'http://localhost:3000'
	]
}