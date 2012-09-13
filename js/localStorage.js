var PROFILE_EXPIRE_TIME = 7 * 24 * 60 * 60 * 1000;

function ProfileLocalStorage() {
  this._indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
  this._db = null;
  if (!this._indexedDB)
    return; // No storage

  var dbRequest = indexedDB.open("cleopatra");
  var self = this;
  dbRequest.onupgradeneeded = function(event) {
    dump("Upgrade cleopatra DB\n");
    var db = event.target.result;
    var store = db.createObjectStore("profiles", {keyPath: "storage_key"});
    store.add( {storageKey: "profile_directory", profileList: []} );
  }
  dbRequest.onsuccess = function(event) {
    dump("Got DB\n");
    this._db = dbRequest.result;
    this._db.transaction("profiles").objectStore("profiles").get("profile_directory").onsuccess = function(event) {
      alert("Name for SSN 444-44-4444 is " + JSON.stringify(event.target.result));
    }
  };
}
ProfileLocalStorage.prototype = {
  getProfileList: function ProfileLocalStorage_getProfileList(callback) {
    if (!this._db)
      return;
    this._db.transaction("profiles").objectStore("profiles").get("profile_directory").onsuccess = function(event) {
      callback(event.target.result.profileList || []);
    };
  },
  storeLocalProfile: function ProfileLocalStorage_storeLocalProfile(profile, callback) {
    if (!this._db)
      return;
    var self = this;
    var time = new Date().getTime();
    this.getProfileList(function got_profile(profileList) {
      var profileKey = "local_profile:" + time;
      self._db.transaction("profiles").objectStore("profiles").add( {storage_key: profileKey, profile: profile} );
      profileList.push( {profileKey: profileKey, expire: time + PROFILE_EXPIRE_TIME, storedTime: time} );
      self._setProfileList(profileList, function updated_profile_list() {
        callback( {profileKey: profileKey} );
      });
    });
  },
  _setProfileList: function ProfileLocalStorage_setProfileList(profileList, callback) {
    if (!this._db)
      return;
    this._db.transaction("profiles").objectStore("profiles").add( {storage_key: "profile_directory", profileList: profileList} );
    callback();
  },
  getProfile: function ProfileLocalStorage_getProfile(profile_key, callback) {
    
  },
};

window.localStorage = new ProfileLocalStorage();
