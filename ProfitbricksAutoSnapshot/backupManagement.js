/**
 *
 * Created by cfrei on 11.03.16.
 */

'use strict'
var minimist = require('minimist')
var co = require('co')
var request = require('superagent')
var sprintf = require('sprintf-js').sprintf


var p = require('./package.json')

var usage = () => {
	console.log('')
	console.log(p.description)
	console.log('')
	console.log('List all available storages and snapshots: --list --user=<...> --password=<...>')
	console.log('Runs the service')
	console.log('  once for snapshot deletion*: --del --user=<...> --password=<...> --noOfSnapshotsToKeep=<n> --storageUUID=<...> --verbose')
	console.log('  once for snapshot creation*: --snap --user=<...> --password=<...> --backupIntervalHours=<hours> --storageUUID=<...> --verbose')
	console.log('  once for both              : --del --snap ...')
	console.log('  run forever                : --server --checkIntervalMinutes=<n> ...')
	console.log('')
	console.log('*: Snapshot creation does only happen, if there is no snapshot pending and the latest snapshot is older than now() - [backupIntervalHours].')
	console.log('   Snapshot creation and deletion does depend on a naming convention in the "description" field. Please do NOT modify that field.')
	console.log('   Snapshot deletion does only happen, if there are more than [noOfSnapshotsToKeep]. The oldest snapshots become removed.')
	console.log('')
	console.log('Software comes AS IS. The author takes no responsibility for any damage. (C) 2016 by frei-services.de.')
}

var postPB = (user, pw, path, data) => {
	return new Promise((resolve, reject) => {
		request
		.post(path.match(/^http/) ? path : `https://api.profitbricks.com/rest${ path }`)
		.set('Content-Type', 'application/x-www-form-urlencoded')
		.set('Authorization', 'Basic '+ (new Buffer(user + ':' + pw, 'utf8')).toString('base64'))
		.send(data)
		.end((error,result) => {
			error ? reject(error) : resolve(JSON.parse(result.text));
		});
	})
}
var getPB = (user, pw, path) => {
	return new Promise((resolve, reject) => {
		request
		.get(path.match(/^http/) ? path: `https://api.profitbricks.com/rest${ path }`)
		.set('Content-Type', 'application/vnd.profitbricks.resource+json')
		.set('Authorization', 'Basic '+ (new Buffer(user + ':' + pw, 'utf8')).toString('base64'))
		.end((error,result) => {
			error ? reject(error) : resolve(JSON.parse(result.text));
		});
	})
}

var deletePB = (user, pw, path) => {
	return new Promise((resolve, reject) => {
		request
		.del(path.match(/^http/) ? path : `https://api.profitbricks.com/rest${ path }`)
		.set('Content-Type', 'application/x-www-form-urlencoded')
		.set('Authorization', 'Basic '+ (new Buffer(user + ':' + pw, 'utf8')).toString('base64'))
		.end((error,result) => {
			error ? reject(error) : resolve();
		});
	})
}

var getVolumes = co.wrap(function*(user, pw) {
	let vdcs = yield getPB(user, pw, '/datacenters')
//	let snapshots = yield getPB(user, pw, '/snapshots')
//	console.log(JSON.stringify(snapshots, null, 2))
//	console.log(JSON.stringify(vdcs, null, 2))

	let result = yield vdcs.items.map(co.wrap(function*(db) {
		let vdc = yield getPB(user, pw, `/datacenters/${ db.id }?depth=99`)
		return vdc.entities.volumes.items.map(volume => {
//			https://api.profitbricks.com/rest/datacenters/{datacenter_id}/volumes/{volume_id}/create-snapshot
			return {
				vdc: db.id,
				uuid: volume.id,
				href: volume.href,
				name: volume.properties.name,
				size: volume.properties.size,
				type: volume.properties.type,
			}
		})
	}))
	return result.reduce((ret, now) => ret.concat(now), [])
})
var getSnapshots = co.wrap(function*(user, pw) {
	let tmpP = [ getVolumes(user, pw), getPB(user, pw, '/snapshots?depth=99') ]
	tmpP = yield tmpP
	let storageIds = tmpP[0].map(v => v.uuid)
	let snapshots = tmpP[1]
	return snapshots.items.map(s => {
		return {
			uuid: s.id,
			href: s.href,
			name: s.properties.name,
			storageUUID: s.properties.description,
			creationTS: new Date(s.metadata.createdDate),
			state: s.metadata.state,
		}
	}).filter(s => storageIds.indexOf(s.storageUUID) >= 0)
})

var printSnaps = function(snapshots) {
	let sformat = '| %-36.36s | %-36.36s | %-25.25s | %-10.10s |'
	let sheader = sprintf(sformat, 'Snapshot UUID', 'StorageUUID', 'Creation Date', 'Status')
	let sline = sheader.split('').map(() => '-').join('')
	console.log(sline)
	console.log(sheader)
	console.log(sline)
	snapshots.forEach(s => console.log(sprintf(sformat, s.uuid, s.storageUUID, s.creationTS.toUTCString(), s.state)))
	console.log(sline)
}

var printVolumes = function(volumes, snapshots) {
	let headFormat = '| %-36.36s | %-36.36s | %-36.36s | %-5.5s | %-4.4s | %-9.9s |'
	let format =     '| %-36.36s | %-36.36s | %-36.36s | %5.5d | %-4.3s | %9.3d |'
	let header = sprintf(headFormat, 'VDC UUID', 'UUID', 'Name', 'Size', 'Type', 'Snapshots')
	let line   = header.split('').map(() => '-').join('')
	console.log(line)
	console.log(header)
	console.log(line)
	volumes.forEach(e => console.log(sprintf(format, e.vdc, e.uuid, e.name, e.size, e.type,
		snapshots.filter(s => e.uuid == s.storageUUID).sort((a, b) => b.creationTS - a.creationTS).length)))
	console.log(line)
}

var list = co.wrap(function*(user, pw) {
	let tmpP = [ getVolumes(user, pw), getSnapshots(user, pw) ]
	tmpP = yield tmpP
	let volumes = tmpP[0]
	let snapshots = tmpP[1]

	// volumes
	printVolumes(volumes, snapshots)

	// snapshots
	printSnaps(snapshots)

	// disclaimer
	console.log('(Only snapshots listed, that the tool can map to storages.)')
})

var sleep = n => new Promise(resolve => setTimeout(resolve, n))


var makeSnap = co.wrap(function*(user, pw, backupInterval, uuid, verbose) {
	let volumes = yield getVolumes(user, pw)
	let snapshots = yield getSnapshots(user, pw)
	let volume = volumes.filter(v => v.uuid == uuid)[0]
	let lastSnapshot = snapshots.filter(s => s.storageUUID == uuid).sort((a, b) => a - b)[0]		// absteigend sortiert
	if (verbose) {
		console.log('Volume found...')
		printVolumes([ volume ], snapshots)
		if (lastSnapshot) {
			console.log('Youngest snapshot found.')
			printSnaps([ lastSnapshot ])
		} else {
			console.log('No snapshot found')
		}
	}
	if (lastSnapshot && lastSnapshot.creationTS > new Date(new Date() - backupInterval * 60 * 60 * 1000)) {
		if (verbose) {
			console.log(`Latest snapshot is younger than the given interval of ${ backupInterval } hours. `)
			console.log('No new snapshot is generated.')
		}
		return
	}
	let result = yield postPB(user, pw, `${ volume.href }/create-snapshot`, { name: `Snapshot for ${ volume.uuid } (${ volume.name })`, description: volume.uuid })
	if (verbose) {
		console.log('Request created and is pending...')
	}
	if (verbose) {
		yield sleep(10)
		snapshots = yield getSnapshots(user, pw)
		snapshots = snapshots.filter(s => s.storageUUID == uuid)
		console.log('(Newest snapshot shows maybe not always up in this list...')
		printSnaps(snapshots)
	}
})

var delSnaps = co.wrap(function*(user, pw, storageUUID, noOfBackups, verbose) {
	let snapshots = yield getSnapshots(user, pw)
	// newest elements first, return the all but <noOfBackups>
	snapshots = snapshots.filter(s => s.storageUUID == storageUUID && s.state == 'AVAILABLE').sort((a, b) => b.creationTS - a.creationTS).slice(noOfBackups)

	if (verbose) {
		console.log('Snapshots to be removed: ')
		printSnaps(snapshots)
	}
	yield snapshots.map(co.wrap(function*(s) {
		return deletePB(user, pw, s.href)
	}))
	if (verbose) {
		console.log(`${ snapshots.length } request(s) sent.`)
	}
})

var main = co.wrap(function*() {
	let args = minimist(process.argv.slice(2))

	// Help
	if (Object.keys(args).length == 1 || args.h || args.help || args['?']) { usage(); return }

	// List
	if (args.list) {
		yield list(args.user, args.password)
		return
	}

	if (args.server && args.checkIntervalMinutes == undefined) {
		usage()
		throw 'Please add checkIntervalMinutes'
	}
	if (args.snap && (args.backupIntervalHours == undefined || args.storageUUID == undefined)) {
		usage()
		throw 'Please add backupIntervalHours and/or storageUUID'
	}
	if (args.del && (args.noOfSnapshotsToKeep == undefined || args.storageUUID == undefined)) {
		usage()
		throw 'Please add noOfSnapshotsToKeep and/or storageUUID'
	}


	do {
		if (args.snap) {
			yield makeSnap(args.user, args.password, args.backupIntervalHours, args.storageUUID, args.verbose)
		}

		if (args.del) {
			yield delSnaps(args.user, args.password, args.storageUUID, args.noOfSnapshotsToKeep, args.verbose)
		}

		if (args.server) {
			if (args.verbose) {
				console.log(`Sleeping for ${ args.checkIntervalMinutes} Minutes...`)
			}
			yield sleep(1000 * 60 * args.checkIntervalMinutes)
		}
	} while(args.server)
})

main().catch(e => console.log('ERROR: ', e.body ? e.body : e.stack ? e.stack : e))
