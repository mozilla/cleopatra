 (function(window) {
  function BreadcrumbTrail() {
    this._breadcrumbs = [];
    this._selectedBreadcrumbIndex = -1;

    this._containerElement = document.createElement("div");
    this._containerElement.className = "breadcrumbTrail";
    var self = this;
    this._containerElement.addEventListener("click", function (e) {
      if (!e.target.classList.contains("breadcrumbTrailItem"))
        return;
      self._enter(e.target.breadcrumbIndex);
    });
  };
  BreadcrumbTrail.prototype = {
    getContainer: function BreadcrumbTrail_getContainer() {
      return this._containerElement;
    },
    /**
     * Add a breadcrumb. The breadcrumb parameter is an object with the following
     * properties:
     *  - title: The text that will be shown in the breadcrumb's button.
     *  - enterCallback: A function that will be called when entering this
     *                   breadcrumb.
     */
    add: function BreadcrumbTrail_add(breadcrumb) {
      for (var i = this._breadcrumbs.length - 1; i > this._selectedBreadcrumbIndex; i--) {
        var rearLi = this._breadcrumbs[i];
        if (!rearLi.breadcrumbIsTransient)
          throw "Can only add new breadcrumbs if after the current one there are only transient ones.";
        rearLi.breadcrumbDiscarder.discard();
      }
      var div = document.createElement("div");
      div.className = "breadcrumbTrailItem";
      div.textContent = breadcrumb.title;
      var index = this._breadcrumbs.length;
      div.breadcrumbIndex = index;
      div.breadcrumbEnterCallback = breadcrumb.enterCallback;
      div.breadcrumbIsTransient = true;
      div.style.zIndex = 1000 - index;
      this._containerElement.appendChild(div);
      this._breadcrumbs.push(div);
      if (index == 0)
        this._enter(index);
      var self = this;
      div.breadcrumbDiscarder = {
        discard: function () {
          if (div.breadcrumbIsTransient) {
            self._deleteBeyond(index - 1);
            delete div.breadcrumbIsTransient;
            delete div.breadcrumbDiscarder;
          }
        }
      };
      return div.breadcrumbDiscarder;
    },
    addAndEnter: function BreadcrumbTrail_addAndEnter(breadcrumb) {
      var removalHandle = this.add(breadcrumb);
      this._enter(this._breadcrumbs.length - 1);
    },
    pop : function BreadcrumbTrail_pop() {
      if (this._breadcrumbs.length-2 >= 0)
        this._enter(this._breadcrumbs.length-2);
    },
    enterLastItem: function BreadcrumbTrail_enterLastItem(forceSelection) {
      this._enter(this._breadcrumbs.length-1, forceSelection);
    },
    _enter: function BreadcrumbTrail__select(index, forceSelection) {
      if (index == this._selectedBreadcrumbIndex)
        return;
      if (forceSelection) {
        gTreeManager.restoreSerializedSelectionSnapshot(forceSelection);
      } else {
        gTreeManager.saveSelectionSnapshot();
      }
      var prevSelected = this._breadcrumbs[this._selectedBreadcrumbIndex];
      if (prevSelected)
        prevSelected.classList.remove("selected");
      var li = this._breadcrumbs[index];
      if (this === gBreadcrumbTrail && index != 0) {
        // Support for back button, disabled until the forward button is implemented.
        //var state = {action: "popbreadcrumb",};
        //window.history.pushState(state, "Cleopatra");
      }
      if (!li)
        console.log("li at index " + index + " is null!");
      delete li.breadcrumbIsTransient;
      li.classList.add("selected");
      this._deleteBeyond(index);
      this._selectedBreadcrumbIndex = index;
      li.breadcrumbEnterCallback();
      // Add history state
    },
    _deleteBeyond: function BreadcrumbTrail__deleteBeyond(index) {
      while (this._breadcrumbs.length > index + 1) {
        this._hide(this._breadcrumbs[index + 1]);
        this._breadcrumbs.splice(index + 1, 1);
      }
    },
    _hide: function BreadcrumbTrail__hide(breadcrumb) {
      delete breadcrumb.breadcrumbIsTransient;
      breadcrumb.classList.add("deleted");
      setTimeout(function () {
        breadcrumb.parentNode.removeChild(breadcrumb);
      }, 1000);
    },
  };

  window.BreadcrumbTrail = BreadcrumbTrail;
}(this));