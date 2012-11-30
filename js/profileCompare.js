function openProfileCompare() {
  new ProfileComparator(document.body);
}
function ProfileComparator(topLevelDiv) {
  this._container = document.createElement("div");
  this._container.className = "profileComparatorDiv";

  this._side1 = document.createElement("div");
  this._side2 = document.createElement("div");
  this._side = [side1, side2];
  this._container.appendChild(this._side1);
  this._container.appendChild(this._side2);

  // Take every element in the topLevelDiv and nest it in
  // a profile comparator div
  while (topLevelDiv.firstChild) {
    var elemToMove = topLevelDiv.firstChild;
    topLevelDiv.removeChild(elemToMove);
    this._side1.appendChild(elemToMove);
  }

  // create an iframe for side2
  this._side2iFrame = document.createElement("iframe");
  this._side2.appendChild(this._side2iFrame);

  return this;
}

ProfileComparator.prototype = {
  getContainer: function ProfileComparator_getContainer() {
    return this._container;
  },
};
