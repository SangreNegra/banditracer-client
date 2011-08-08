var gamejs = require('gamejs');
var renderer = require('./renderer');
var utils = require('./utils');
var fonts = require('gamejs/font');
var levels=require('./levels');
var resources = require('./resources');
var weapons=require('./weapons');
var ui=require('./ui');
var ui2=require('./ui2');
var uiscenes=require('./uiscenes');
var settings=require('./settings');
var gamescenes=require('./gamescenes');
var sounds=require('./sounds');
var editor=require('./editor');

var getDefCarDescr=exports.getDefCarDescr=function(){
    return {'type':'Racer',
            'front_weapon':{'type':'Machinegun',
                            'ammo_upgrades':3,
                            'dmg_upgrades':3},
            'util':null,
            'rear_weapon':{'type':'MineLauncher',
                            'ammo_upgrades':0,
                            'dmg_upgrades':0},
            'acc_upgrades':0,
            'speed_upgrades':0,
            'armor_upgrades':0}
}

exports.getPreloadList=function(){
    var retv=new Array();
    var i;
    for(i=0;i<resources.cars.length;i++){
        retv[retv.length]='images/cars/'+resources.cars[i];
    }
    for(i=0;i<resources.tiles.length;i++){
        retv[retv.length]='images/tiles/'+resources.tiles[i];
    }
    for(i=0;i<resources.props.length;i++){
        retv[retv.length]='images/props/'+resources.props[i];
    }
    for(i=0;i<resources.animations.length;i++){
        retv[retv.length]='images/animations/'+resources.animations[i];
    }
    for(i=0;i<resources['statics'].length;i++){
        retv[retv.length]='images/static/'+resources['statics'][i];
    }
    for(i=0;i<resources.ui.length;i++){
        retv[retv.length]='images/ui/'+resources.ui[i];
    }
    
    resources.decals.forEach(function(filename){
        retv.push('images/decals/'+filename); 
    });
    
    if(settings.get('SOUND')){
        resources.sound_fx.forEach(function(filename){
           retv.push('sounds/fx/'+filename); 
        });
        
        resources.sound_engine.forEach(function(filename){
           retv.push('sounds/engine/'+filename); 
        });
    }
    
    return retv;
};

var Director=exports.Director= function Director (display) {
    var onAir = false;
    var activeScene = null;
    this.display=display;
 
    function tick(msDuration){
        tick_logic(msDuration);
        tick_render(msDuration);
    }
 
    function tick_logic(msDuration){
        if (!onAir) return;
        if (activeScene.handleEvent) {
            var evts=gamejs.event.get();
            var i;
            for(i=0;i<evts.length;i++){
               activeScene.handleEvent(evts[i]);
            }
        } else {
           // throw all events away
           gamejs.event.get();
        }
        if (activeScene.update) activeScene.update(msDuration);
    }
 
    function tick_render(msDuration){
        //console.log(display);
        if(activeScene.draw) activeScene.draw(display, msDuration);
    }
 
    this.start = function(scene) {
       onAir = true;
       this.replaceScene(scene);
       return;
    };
 
    this.replaceScene = function(scene) {
        if(activeScene && activeScene.destroy) activeScene.destroy(); 
        activeScene = scene;
    };
 
    this.getScene = function() {
       return activeScene;
    };
    //gamejs.time.fpsCallback(tick_logic, this, logic_fps);
    gamejs.time.fpsCallback(tick, this, settings.get('FPS'));
    return this;
};


var Communicator=exports.Communicator=function(game){
    this.game=game;
    this.socket;
    this.next_transaction_id=1;
    this.messages=[];
    this.status='closed';

    this.queueMessage=function(cmd, payload){
        /*
        message payload is returned as first argument,
        arg as second payload
        */
        this.messages[this.messages.length]=[cmd, payload ? payload : {}];
        this.send();
    };

    this.send=function(){
        if(this.status=='open'){
            for(var i=0;i<this.messages.length;i++){
                var msg={'cmd':this.messages[i][0],
                         'uid':this.game.player.uid,
                         'payload':this.messages[i][1]};
                msg=JSON.stringify(msg);
                //gamejs.log('sending ', msg);
                this.socket.send(msg);
               // console.log('sent '+msg);
            }
            this.messages=[];
        }else if (this.status=='closed'){
            this.connect();
        }else{
            throw new Error('unknown network status');
        }
    };

    this.connect=function(){
        gamejs.log('Connecting...');
        this.socket = new WebSocket(settings.get('SERVER'));
        this.status='connecting';
        var self=this;
        this.socket.onopen = function() {self.onopen();};
        this.socket.onmessage = function(m) {self.onmessage(m);};
        this.socket.onclose = function() {self.onclose();};
        this.socket.onerror = function() {self.onerror();};
    };

    this.onopen=function(){
        gamejs.log('Connection established!');
        this.status='open';
        this.send();
    };

    this.onmessage=function(m){
       // console.log('recv '+m.data);
        m=JSON.parse(m.data);
        this.game.director.getScene().handleMessage(m.cmd, m.payload);
    };

    this.onclose=function(){
        this.status='closed';
        console.log(this.error ? 'socket closed on error ' : 'socket closed!');
        this.game.aquainted=false;
        this.game.showTitle();
        this.game.player.uid=null;
        this.game.title_scene.alert(this.error ? 'Socket error, connection closed.' : 'Server closed the connection!');
        this.error=false;
    };

    this.error=false;

    this.onerror=function(){
        this.socket.close();
        this.error=true;
    };
};

exports.init=function(){
    exports.game=new Game();
    return exports.game;
};

var Game=exports.Game=function(){
    this.director=null;
    this.cache=renderer.init();
    if(settings.get('SOUND')) sounds.init();
    ui2.init();
    this.socket=null;
    this.player={'alias':'Guest',
                 'uid':null,
                 'singleplayer':{
                    'balance':1000,
                    'car':getDefCarDescr()
                    }
                };

    this.communicator=null;
    this.acquainted=false; //receved a player id from server?

    this.getCommunicator=function(){
         if(!this.communicator)this.communicator=new Communicator(this);
         return this.communicator;
    };

    this.start=function(display){
        this.display=display;
        this.director=new Director(display);
        this.title_scene=new uiscenes.TitleScene(this, this.cache);
        this.director.start(this.title_scene);
        //this.playLevel(levels.trbryraceway, 'Bandit', true);
    };

    this.showEndGameScene=function(position){
         this.director.replaceScene(new uiscenes.EndRaceScene(this, this.cache, position));
    };

    this.showTitle=function(){
       this.director.replaceScene(this.title_scene);
    };

    this.createLobby=function(){
         this.director.replaceScene(new uiscenes.CreateLobbyScene(this, this.cache));
    };

    this.showLobbyList=function(){
         this.director.replaceScene(new uiscenes.JoinLobbyScene(this, this.cache));
    };
    
    this.returnTo=function(){
        if(this.return_to){
            if(this.return_to=='editor'){
                this.return_to='';
                this.showEditor();
                return;
            }
            else if(this.return_to=='singleplayer'){
                this.return_to='';
                this.singleplayer();
                return;
            }
        
        }
        this.showTitle();
        return;
    };

    this.showGameOver=function(table, win){
        this.director.replaceScene(new uiscenes.GameOverScene(table, win));
    };
    
    this.showEditor=function(){
        if(!this.editor_scene)this.editor_scene= new editor.EditorScene()
        this.director.replaceScene(this.editor_scene);  
    };

    this.joinLobby=function(lobby_id){
        this.director.replaceScene(new uiscenes.LobbyScene(this, this.cache, lobby_id));
    };
    
    this.singleplayer=function(){
         this.director.replaceScene(new uiscenes.SinglePlayerScene(this, this.cache));
    };

    this.playMultiplayer=function(level){
        this.level_scene=new gamescenes.MultiplayerLevelScene(this, level, this.cache);
        this.director.replaceScene(this.level_scene);
    };

    this.playLevel=function(level, ai_test, splash, return_to){
         this.level_scene=new gamescenes.SingleplayerLevelScene(level, ai_test);
         this.return_to=return_to;
         if(splash) this.director.replaceScene(new uiscenes.ControlsSplash(this, this.cache, this.level_scene));
         else this.director.replaceScene(this.level_scene);
    };
};
