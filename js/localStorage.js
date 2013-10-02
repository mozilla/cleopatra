var PROFILE_EXPIRE_TIME = 7 * 24 * 60 * 60 * 1000;

// Simple wrapper for an abstract local storage provider (indexedDB)
// to provide a key based JSON storage.
function JSONStorage() {
  this._indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
  this._db = null;
  this._pendingRequests = [];
  if (!this._indexedDB)
    return; // No storage

  var dbRequest = this._indexedDB.open("cleopatra", 2);
  var self = this;
  dbRequest.onupgradeneeded = function(event) {
    PROFILERLOG("Upgrade cleopatra DB");
    var db = event.target.result;
    var store = db.createObjectStore("profiles", {keyPath: "storage_key"});
  }
  dbRequest.onsuccess = function(event) {
    PROFILERLOG("'cleopatra' database open");
    self._db = dbRequest.result;
    for (var i = 0; i < self._pendingRequests.length; i++) {
      self._pendingRequests[i]();
    }
    self._pendingRequests = [];
  };

}
JSONStorage.prototype = {
  setValue: function JSONStorage_setValue(key, value, callback) {
    if (!this._db) {
      var self = this;
      this._pendingRequests.push(function pendingSetValue() {
        self.setValue(key, value, callback);
      });
      return;
    }
    try {
      this._db.transaction("profiles", "readwrite").objectStore("profiles").put( {storage_key: key, value: value} );
    } catch (e) {
      dump("localStorage error: " + e + "\n");
      return;
    }
    //PROFILERTRACE("JSONStorage['" + key + "'] set " + JSON.stringify(value));
    if (callback)
      callback();
  },

  getValue: function JSONStorage_getValue(key, callback) {
    if (!this._db) {
      var self = this;
      this._pendingRequests.push(function pendingGetValue() {
        self.getValue(key, callback);
      });
      return;
    }
    var transaction = this._db.transaction("profiles");
    var request = transaction.objectStore("profiles").get(key);
    request.onsuccess = function(event) {
      if (!callback)
        return;
      //PROFILERTRACE("JSONStorage['" + key + "'] get " + JSON.stringify(request.result));
      if (request.result) {
        callback(request.result.value);
      } else {
        callback(null);
      }
    }
    request.onerror = function() {
      PROFILERERROR("Error getting value from indexedDB");
    }
  },

  deleteValue: function JSONStorage_deleteValue(key, callback) {
    if (!this._db) {
      var self = this;
      this._pendingRequests.push(function pendingDeleteValue() {
        self.deleteValue(key, callback);
      });
      return;
    }
    var transaction = this._db.transaction("profiles", "readwrite");
    var request = transaction.objectStore("profiles").delete(key);
    request.onsuccess = function(event) {
      if (!callback)
        return;
      //PROFILERTRACE("JSONStorage['" + key + "'] get " + JSON.stringify(request.result));
      if (request.result) {
        callback(request.result.value);
      } else {
        callback(null);
      }
    }
    request.onerror = function() {
      PROFILERERROR("Error deleting value from indexedDB");
    }
  },

  clearStorage: function JSONStorage_clearStorage(callback) {
    if (!this._db) {
      var self = this;
      this._pendingRequests.push(function pendingSetValue() {
        self.clearStorage(callback);
      });
      return;
    }
    var transaction = this._db.transaction("profiles", "readwrite");
    var request = transaction.objectStore("profiles").clear();
    request.onsuccess = function() {
      PROFILERLOG("Cleared local profile storage");
      if (callback)
        callback();
    }
  },
}

function ProfileLocalStorage() {
  this._storage = new JSONStorage();
  this._profileListChangeCallback = null;
}
ProfileLocalStorage.prototype = {
  onProfileListChange: function ProfileLocalStorage_OnProfileListChange(callback) {
    this._profileListChangeCallback = callback;
  },

  getProfileList: function ProfileLocalStorage_getProfileList(callback) {
    this._storage.getValue("profileList", function gotProfileList(profileList) {
      profileList = profileList || [];
      callback(profileList);
    });
  },

  storeLocalProfile: function ProfileLocalStorage_storeLocalProfile(profile, profileKey, callback, custom_info) {
    var self = this;
    custom_info = custom_info || {};
    var date = new Date();
    var time = date.getTime();
    var name = custom_info.name || "Local Profile";
    if (name == "profileList") {
      // Make sure we don't override our profile list entry
      name = "Profile List";
    }
    this.getProfileList(function got_profile(profileList) {
      profileKey = profileKey || "local_profile:" + time;
      for (var i = 0; i < profileList.length; i++) {
        if (profileList[i].profileKey == profileKey) {
          return;
        }
      }
      var tempProfileCount = 0;
      for (profileIndex in profileList) {
        var profile = profileList[profileIndex];
        if (profile.retain == false) {
          tempProfileCount++; 
        }
      }
      var profilesToRemove = tempProfileCount - 5;
      for (profileIndex in profileList) {
        var profile = profileList[profileIndex];
        if (profile.retain == false && profilesToRemove > 0) {
          self._deleteLocalProfile(profileToRemove);
        }
      }
      if (profileList.length >= 5) {
        var profileToRemove = profileList[0].profileKey;
        self._deleteLocalProfile(profileToRemove);
        profileList.shift();
      }
      profileList.push( {profileKey: profileKey, key: profileKey, name: name, date: date.getTime(), expire: time + PROFILE_EXPIRE_TIME, storedTime: time} );
      self._storage.setValue(profileKey, profile, function complete() {
        self._storage.setValue("profileList", profileList);
        if (callback)
          callback();
        if (self._profileListChangeCallback) {
          self._profileListChangeCallback(profileList);
        }
      });
    });
  },

  renameProfile: function ProfileLocalStorage_renameProfile(profileKey, name) {
    var self = this;
    if (name == "profileList") {
      // Make sure we don't override our profile list entry
      name = "Profile List";
    }
    this.getProfileList(function renameProfileWithList(profileList) {
      for (var profileIndex in profileList) {
        var profileInfo = profileList[profileIndex];
        if (profileInfo.profileKey == profileKey) {
          profileInfo.name = name;
          profileInfo.retain = true;
          self._storage.setValue("profileList", profileList);
          return;
        }
      }
    });
  },

  getProfile: function ProfileLocalStorage_getProfile(profileKey, callback) {
    this._storage.getValue(profileKey, callback); 
  },

  // This version doesn't update the profileList entry
  _deleteLocalProfile: function ProfileLocalStorage__deleteLocalProfile(profileKey, callback) {
    this._storage.deleteValue(profileKey, callback); 
  },

  deleteLocalProfile: function ProfileLocalStorage_deleteLocalProfile(profileKey, callback) {
    var self = this;
    this._storage.deleteValue(profileKey, function () {
      self.getProfileList(function got_profile(profileList) {
        for (var profileIndex in profileList) {
          var profileInfo = profileList[profileIndex];
          if (profileInfo.profileKey == profileKey) {
            profileList.splice(profileIndex, 1);
            self._storage.setValue("profileList", profileList, callback);
            break;
          }
        }
      });
    }); 
  },

  clearStorage: function ProfileLocalStorage_clearStorage(callback) {
    this._storage.clearStorage(callback);
  },
};

var gLocalStorage = new ProfileLocalStorage();

function quickTest() {
  gLocalStorage.getProfileList(function(profileList) {
    gLocalStorage.storeLocalProfile({}, function() {
      gLocalStorage.clearStorage();
    });
  });
}
//quickTest();
