'use strict';

(function(window) {
  var FileList = function FileList() {
    this._container = document.createElement("ul");
    this._container.id = "fileList";
    this._selectedFileItem = null;
    this._fileItemList = [];
  }

  FileList.prototype = {
    getContainer: function FileList_getContainer() {
      return this._container;
    },

    clearFiles: function FileList_clearFiles() {
      this.fileItemList = [];
      this._selectedFileItem = null;
      this._container.innerHTML = "";
    },

    loadProfileListFromLocalStorage: function FileList_loadProfileListFromLocalStorage() {
      var self = this;
      gLocalStorage.getProfileList(function(profileList) {
        for (var i = profileList.length - 1; i >= 0; i--) {
          (function closure() {
            // This only carries info about the profile and the access key to retrieve it.
            var profileInfo = profileList[i];
            //PROFILERTRACE("Profile list from local storage: " + JSON.stringify(profileInfo));
            var dateObj = new Date(profileInfo.date);
            var fileEntry = self.addFile(profileInfo, dateObj.toLocaleString(), function fileEntryClick() {
              dump("open: " + profileInfo.profileKey + "\n");
              loadLocalStorageProfile(profileInfo.profileKey);
            });
          })();
        }
      });
      gLocalStorage.onProfileListChange(function(profileList) {
        self.clearFiles();
        self.loadProfileListFromLocalStorage();
      });
    },

    addFile: function FileList_addFile(profileInfo, description, onselect) {
      var li = document.createElement("li");

      var fileName;
      if (profileInfo.profileKey && profileInfo.profileKey.indexOf("http://profile-store.commondatastorage.googleapis.com/") >= 0) {
        fileName = profileInfo.profileKey.substring(54);
        fileName = fileName.substring(0, 8) + "..." + fileName.substring(28);
      } else {
        fileName = profileInfo.name;
      }
      li.fileName = fileName || "(New Profile)";
      li.description = description || "(empty)";

      li.className = "fileListItem";
      if (!this._selectedFileItem) {
        li.classList.add("selected");
        this._selectedFileItem = li;
      }

      var self = this;
      li.onclick = function() {
        self.setSelection(li);
        if (onselect)
          onselect();
      }

      var fileListItemTitleSpan = document.createElement("span");
      fileListItemTitleSpan.className = "fileListItemTitle";
      fileListItemTitleSpan.textContent = li.fileName;
      li.appendChild(fileListItemTitleSpan);

      var fileListItemDescriptionSpan = document.createElement("span");
      fileListItemDescriptionSpan.className = "fileListItemDescription";
      fileListItemDescriptionSpan.textContent = li.description;
      li.appendChild(fileListItemDescriptionSpan);

      this._container.appendChild(li);

      this._fileItemList.push(li);

      return li;
    },

    setSelection: function FileList_setSelection(fileEntry) {
      if (this._selectedFileItem) {
        this._selectedFileItem.classList.remove("selected");
      }
      this._selectedFileItem = fileEntry;
      fileEntry.classList.add("selected");
      if (this._selectedFileItem.onselect)
        this._selectedFileItem.onselect();
    },

    profileParsingFinished: function FileList_profileParsingFinished() {
      //this._container.querySelector(".fileListItemTitle").textContent = "Current Profile";
      //this._container.querySelector(".fileListItemDescription").textContent = gNumSamples + " Samples";
    }
  };

  window.FileList = FileList;
}(this));
