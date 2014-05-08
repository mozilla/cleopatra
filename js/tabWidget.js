var HistogramContainer;

(function () {
  function createCanvas() {
    var canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "60px";
    return canvas;
  }

  function createElement(name, props) {
    var el = document.createElement(name);

    for (var key in props) {
      if (key === "style") {
        for (var styleName in props.style) {
          el.style[styleName] = props.style[styleName];
        }
      } else {
        el[key] = props[key];
      }
    }

    return el;
  }

  TabWidget = function () {
    this.tabs = {};
    this.widget = createElement("div", {
      className: "tabWidget",
      style: {
        height: "100%",
        display: "flex",
        flexDirection: "column",
      },
    });
    this.tabList = createElement("div", {
      className: "tabList tabrow",
      style: {
        background: "whitesmoke",
      },
    });
    this.tabContainer = createElement("div", {
      className: "tabContainer",
      style: {
        flex: "1 1 0%",
      },
    });
    this.widget.appendChild(this.tabList);
    this.widget.appendChild(this.tabContainer);
  }

  TabWidget.prototype = {
    tabs:               null,
    container:          null,
    currentTab:         null,
    tabList:            null,

    addTab: function (tabName, tabContainer) {
      this.tabs[tabName] = tabContainer;
      if (this.currentTab == null) {
        this.selectTab(tabName);
      } else if (this.currentTab == tabName) {
        this.currentTab = null; // FORCE
        this.selectTab(tabName);
      }
      this._updateTabList();
    },

    getContainer: function() {
      return this.widget;
    },

    getTab: function (tabName) {
      return this.tabs[tabName];
    },

    selectTab: function (tabName) {
      if (this.tabs[tabName] == null) {
        throw "Tab does not exist";
      }
      if (this.currentTab == tabName) {
        return;
      }
      // Handle lazy tab
      if (typeof(this.tabs[tabName]) == "function") {
        this.tabs[tabName] = this.tabs[tabName](); 
      }
      this.tabContainer.innerHTML = "";
      this.tabContainer.appendChild(this.tabs[tabName]); 
      this.currentTab = tabName;
      this._updateTabList();
    },

    _updateTabList: function () {
      var self = this;
      this.tabList.innerHTML = "";
      // See http://css-tricks.com/better-tabs-with-round-out-borders/
      for (var i in this.tabs) {
        var tabTitle = i;
        var tabTitleLi = createElement("li", {
        });
        var tabTitleDiv = createElement("a", {
          textContent: i,
          href: "#",
          tabName: i,
          onclick: function() {
            self.selectTab(this.tabName);
            return false;
          },
        });
        if (i == this.currentTab) {
          tabTitleLi.className = "selected";
        }
        tabTitleLi.appendChild(tabTitleDiv);
        this.tabList.appendChild(tabTitleLi);
      }
      if (Object.keys(this.tabs).length < 2) {
        this.tabList.style.display = "none";
      } else {
        this.tabList.style.display = "initial";
      }
    },
  }
}());

