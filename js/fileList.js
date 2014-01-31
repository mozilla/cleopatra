'use strict';

(function(window) {
  function loadLocalStorageProfile(profileKey) {
    var reporter = AppUI.enterProgressUI();
    var subreporters = reporter.addSubreporters({
      fileLoading: 1000,
      parsing: 1000
    });

    gLocalStorage.getProfile(profileKey, function(profile) {
      subreporters.fileLoading.finish();
      /**
       * @todo Decouple AppUI
       */
      AppUI.loadRawProfile(subreporters.parsing, profile, profileKey);
    });
    subreporters.fileLoading.begin("Reading local storage...");
  }

  /**
   * FileList is the panel displaying all files.
   */
  function FileList() {
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
              loadLocalStorageProfile(profileInfo.profileKey);
            },
            function fileRename(newName) {
              gLocalStorage.renameProfile(profileInfo.profileKey, newName);
            },
            function fileDelete() {
              gLocalStorage.deleteLocalProfile(profileInfo.profileKey, function deletedProfileCallback() {
                self.clearFiles();
                gFileList.loadProfileListFromLocalStorage();
              });
            });
          })();
        }
      });
      gLocalStorage.onProfileListChange(function(profileList) {
        self.clearFiles();
        self.loadProfileListFromLocalStorage();
      });
    },

    addFile: function FileList_addFile(profileInfo, description, onselect, onrename, ondelete) {
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

      var fileListItemTitleSpan = document.createElement("input");
      fileListItemTitleSpan.type = "input";
      fileListItemTitleSpan.className = "fileListItemTitle";
      fileListItemTitleSpan.value = li.fileName;
      fileListItemTitleSpan.onclick = function(event) {
        event.stopPropagation();
      };
      fileListItemTitleSpan.onblur = function() {
        if (fileListItemTitleSpan.value != li.fileName) {
          onrename(fileListItemTitleSpan.value);
        }
      };
      fileListItemTitleSpan.onkeypress = function(event) {
        var code = event.keyCode;
        var ENTER_KEYCODE = 13;
        if (code == ENTER_KEYCODE) {
          fileListItemTitleSpan.blur();
          onrename(fileListItemTitleSpan.value);
        }
      };
      li.appendChild(fileListItemTitleSpan);

      var fileListItemDescriptionSpan = document.createElement("span");
      fileListItemDescriptionSpan.className = "fileListItemDescription";
      fileListItemDescriptionSpan.textContent = li.description;
      li.appendChild(fileListItemDescriptionSpan);

      var deleteProfileButton = document.createElement("div");
      deleteProfileButton.className = "fileListItemDelete";
      deleteProfileButton.title = "Delete the profile from your local cache";
      deleteProfileButton.onclick = function(event) {
        event.stopPropagation();
        ondelete();
      };
      li.appendChild(deleteProfileButton);

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
