module.exports = function(io) {

		var get = require('./player_getters.js');
		var set = require('./player_setters.js');
	//listeners
    io.on('connection',function(socket){  
	    //log the new user
	    console.log("A user is connected: "+socket.id);

		socket.on('i wanna play', function (profile) {
			console.log("This user wants to play:",JSON.stringify(profile));

			set.updateInPlay(profile,socket.id,function(err){
				if(err){
					console.log('**** socket.on.i-wanna-play.updateInPlay failed:', err.message);
				}
			});

			get.stats(profile['player_id'], function (err, stats) {
				if(!err){
					sendStats(stats,0,true);
					updateNewsFeed(stats['player_name'],'joined the party!','neutral');
				} else {
					console.log('**** socket.on.i-wanna-play.get.stats failed: ',err.message);
				}
			});

			get.myItems(profile['player_id'], function (err, myItems) {
				if(!err){
					sendItems(myItems,0);
				} else {
					console.log('**** socket.on.i-wanna-play.get.myItems failed: ',err.message);
				}
			});
		});

		socket.on('whos playing',function(profile){
			console.log('getting other players');
			get.otherPlayers(profile, function (err, otherPlayers) {
				if(!err){
					for (var i = 0; i < otherPlayers.length; i++) {
						var aPlayer = otherPlayers[i];
						console.log('found player ',aPlayer['player_name']);
						socket.emit('player joined the party',aPlayer);
					}
				} else {
					console.log('**** socket.on.whos-playing failed',err);
				}
			});

		});

		socket.on('who can I play as', function (userId) {
			get.myPlayers(userId, function (err, players) {
				console.log('Got ',players.length,' players for user ', userId);
			    socket.emit('heres your players',players);
			});
		});

		socket.on('get all players', function () {
			get.allPlayers(function (err, players) {
				if(!err){
			    	socket.emit('heres your players',players);
				} else {
					console.log('**** socket.on.get-all-players failed',err);
				}
				
			})
		});

		socket.on('health affected',function (data) {
			console.log('health affected', data);
			set.addLE(data, function (err,stats) {
				get.stats(data['player_id'], function(err, stats) {
					if(err){
						console.log('***** set.addLE.query.getstats Failed:', err.message);
					} else {
						//send stats back to player and add companion div to other players
						sendStats(stats,data['session'],false);
						var msg ='';
						var sentiment = '';
						if(data['value']>0){
							msg = ' recovered ' + data['value'] + ' health!';
							sentiment = 'good';
						} else {
							msg = ' took ' + data['value'] + ' damage!';
							sentiment = 'bad';
						}
						//update the feed
						updateNewsFeed(stats['player_name'],msg,sentiment);
					}
				});
			});
		});

		socket.on('energies affected',function (data) {
			console.log('energies affected', data);
			set.addEnergies(data, function (err) {
				if(!err){
					get.stats(energyArray['player_id'], function(err, stats) {
						if(err){
							console.log('***** set.addEnergies.get.stats Failed:', err.message);
						} else {
							//send stats back to player and add companion div to other players
							sendStats(stats,energyArray['session'],false);
						}
					});
				} else {
					console.log('***** set.addEnergies Failed:', err.message);
				}
			});
		});


		socket.on('get player stats', function (profile) {
			console.log('Who called this? get player stats:',profile);
		});


		socket.on('create player', function (details) {
			console.log('creating player:', details);
			var cleanedUpDetails = {
						player_name:details['player_name'],
						PE:details['PE'],
						ME:details['ME'],
						SE:details['SE'],
						PM:0,
						SM:0,
						MM:0,
						LE:100,
						IMG:details['IMG'],
						INFO:details['INFO']
					};
			set.createPlayer(cleanedUpDetails, details['userId'], function (err, success) {
						if(!err){
							socket.emit('created!');//tell the create page to redirect
						} else {
							console.log('**** socket.on.create-player failed',err);
						}
					}
				);
		});

		socket.on('list items', function () {
			get.allItems(function (err,items) {
				if(!err){
					console.log(items);
					socket.emit('heres the item list',items);
				} else { console.log('***** socket.on.list-items failed:', err.message); }
				
			})
		});

		socket.on('dropped item', function (profile,itemKey) {

			set.dropItem({item_id:itemKey['item_id'],pickup_key:itemKey['pickup_key']}, function (err, info) {
				if(!err){
					updateNewsFeed(profile['player_name'],'dropped ','neutral',itemKey);
				}
			})
		});

		socket.on('picked up item', function (itemName,profile, itemProfile) {
			set.pickupItem(profile['player_id'],itemProfile, function (err) {
				if(!err){
					get.lookupItem(itemProfile['item_id'], function (err,item) {
						console.log(profile['player_name'],'picked up '+ item['item_name']+'!');
						io.emit('clean item',itemProfile['pickup_key']);
						updateNewsFeed(profile['player_name'],'picked up '+ item['item_name']+'!','neutral');
						sendOnlyOneItem(item,0);
					});
				}  else { console.log('***** socket.on.pickupItem failed:', err.message); }
			});
		});

		socket.on('give item', function (targetPlayerId,itemKey) {
			let targetProfile = {player_id : parseInt(targetPlayerId, 10), in_play: 1};
			get.session(targetProfile,function (err, session) {
				if(!err){
					set.giveItem(itemKey,parseInt(targetPlayerId, 10), function (err) {
						if(!err){
							get.lookupItem(itemKey['item_id'], function (err, item) { //get details to send
								if(!err){
									sendOnlyOneItem(item,session);
								} else { console.log('***** socket.on.give-item.get.lookupItem failed:', err.message);}
							})
							
						} else { console.log('***** socket.on.give-item.giveItem failed:', err.message); }
					});
				} else { console.log('***** socket.on.give-item.get.session failed:', err.message); }
			});
		});

		socket.on('gm gives an item',function (data) {
			set.NewPlayerItem(data, function (err,itemId) {
				get.lookupItem(itemId, function (err, item) { //get details to send
					if(!err){
						sendOnlyOneItem(item,data['session']);
					} else { console.log('***** socket.on.give-item.get.lookupItem failed:', err.message);}
				})
				updateNewsFeed(data['player_name'],'aquired ' + item['item_name']+'!','good');
			});
		});

		socket.on('use item', function (itemId,targetPlayerId) {
			//first lookup the item
			targetPlayerId = parseInt(targetPlayerId, 10);
			get.lookupItem(itemId, function (err, item) {
					switch(item['item_type']) {
					    case 'WEAPON':
					        item['mod_value'] = item['mod_value'] * -1;
					        break;
					    case 'ITEM':
					        //no change
					        break;
					    case 'SPELL':
					        //no change
					        break;
					    case 'ARMOR':
					        //can't use armor on someone else. must give it, 
					        //will hide on page, but incase someone get's sneaky 
					        //in the console, this will catch it
					        item['mod_value'] = 0;
					        break;
					    default:
					        //code block
					}
				if(!err){
					set.useItem(item['mod_type'],item['mod_value'],targetPlayerId, function (err) {
						if(!err){
							var profile = {player_id : targetPlayerId, in_play: 1};
							get.session(profile, function (err, session) {
								if(!err){
									get.stats(targetPlayerId, function (err, stats) {
										if(!err){
											sendStats(stats,session,false);
											var useText = ' '+item['consume_word']+' '+item['item_name'] + ' on ' + stats['player_name'];
											updateNewsFeed(stats['player_name'],useText,'neutral');
										} else {
											console.log('**** socket.on.use-item.get.stats failed: ',err.message);
										}});
								} else {
									console.log('**** socket.on.use-item.get.session failed:',err.message);
								}
							});
						} else {
							console.log('**** socket.on.use-item.useItem failed:',err.message);
						}
					});
				} else {
					console.log('**** socket.on.use-item.lookupItem failed:',err.message);
				}
			});
		});

		socket.on('disconnect', function () {
			console.log('User disconnect:',socket.id );
				var h = socket.request.headers.referer;
				var i = h.indexOf('/player/');
				if(i > -1) {
					var player_id = h.substring(i+8,h.lastIndexOf('/'));
					var player_name = h.substring(h.lastIndexOf('/')+1);
					socket.broadcast.emit('player left party',parseInt(player_id));
					updateNewsFeed(player_name,'left the session!','neutral');
				}
		});

		function sendStats(stats,session,isNew) {
			console.log('got session ',session);
			//determine if this is coming from a player joining or a gm pushing an update
			if(session==0){
				socket.emit('heres your stats',stats);
			} else {
				socket.broadcast.to(session).emit('heres your stats',stats);
				socket.emit('heres your stats',stats);//this sends back to the sender (gm) the new stats
			}
			if(isNew){
				//build the companion divs
				socket.broadcast.emit('player joined the party',stats);
			} else {
				//update the companion divs
				socket.emit('player updated',stats);
			}
		}

		function sendItems(items,session) {
			if(session==0){
				socket.emit('heres your items',items);
			} else {
				socket.broadcast.to(session).emit('heres your items',items);
				socket.emit('heres your items',items); //this sends back to the sender gm the new items
			}
		}

		function sendOnlyOneItem(item,session) {
			if(session==0){
				socket.emit('heres your item',item);
			} else {
				console.log('sending to session ',session, ' this item:', item);
				socket.broadcast.to(session).emit('heres your item',item);
				//socket.emit('heres your item',item); //this sends back to the sender gm the new items
			}
		}

		function updateNewsFeed(playerName,action,type,itemKey) {
			var text = '';
			var html ='<div id=item class='+type+' style="display:none">';
			if(itemKey){
				html+= '<p>'+playerName + ' ' + action+' <a id=\''+ itemKey['pickup_key']+'\' href=# onclick="pickupItem(\''+itemKey['item_name']+'\','+ itemKey['item_id'] +',\''+itemKey['pickup_key'] +'\')" >'+itemKey['item_name']+'</a></p></div>';
				io.emit('feed updated',html);
				
			} else {
				html += '<p>'+playerName + ' ' + action+'</p></div>';
				io.emit('feed updated',html);
			}
		}

		function reply(type,handle,payload,session,callback) {
			switch(type){
				case 'all':
					io.emit(handle,payload);
					break;
				case 'sender':
					socket.emit(handle,payload);
					break;
				case 'others':
					socket.broadcast.emit(handle,payload);
					break;
				case 'toSession':
					socket.broadcast.to(session).emit(handle,payload);
					break;
				default:
			}
			callback(null,sent);
		}

	});

}

