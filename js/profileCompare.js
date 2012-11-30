function openProfileCompare() {
  new ProfileComparator(document.body);
}
function ProfileComparator(topLevelDiv) {
  var self = this;

  this._container = document.createElement("div");
  this._container.className = "profileComparatorDiv";

  this._side1 = document.createElement("div");
  this._side1.id = "side1";
  this._side1.className = "profileComparatorSide1";
  this._side2 = document.createElement("div");
  this._side2.id = "side2";
  this._side2.className = "profileComparatorSide2";
  this._side = [this._side1, this._side2];
  this._container.appendChild(this._side1);
  this._container.appendChild(this._side2);

  // Take every element in the topLevelDiv and nest it in
  // a profile comparator div
  while (topLevelDiv.firstChild) {
    var elemToMove = topLevelDiv.firstChild;
    topLevelDiv.removeChild(elemToMove);
    this._side1.appendChild(elemToMove);
  }
  topLevelDiv.appendChild(this._container);

  // create an iframe for side2
  this._side2iFrame = document.createElement("iframe");
  this._side2iFrame.src = "file:///Volumes/Guest OS/Users/bgirard/ben/sps/cleopatra/index.html";
  this._side2iFrame.onload = function() {
    //self._side2iFrame.contentWindow.enterProgressUI();
  }
  this._side2.appendChild(this._side2iFrame);
  this._side1.window = window;
  this._side2.window = self._side2iFrame.contentWindow;

  this._side1.window.comparator_setSelection = function(frames) {
    self._setSelection(self._side1, self._side2, frames);
  }
  this._side2.window.comparator_setSelection = function(frames) {
    self._setSelection(self._side2, self._side1, frames);
  }

  return this;
}

ProfileComparator.prototype = {
  getContainer: function ProfileComparator_getContainer() {
    return this._container;
  },
  _setSelection: function ProfileComparator__setSelection(divSrc, divDest, frames) {
    dump("Set selection " + divSrc.id + " -> " + divDest.id + "\n\n\n\n\n\n\n");
  },
};
