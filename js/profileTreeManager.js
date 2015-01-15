'use strict';

(function(window) {
  function treeObjSort(a, b) {
    return b.counter - a.counter;
  }

  function ProfileTreeManager() {
    this.treeView = new TreeView();
    this.treeView.setColumns([
      { name: "sampleCount", title: "Running time" },
      { name: "selfSampleCount", title: "Self" },
      { name: "resource", title: "" },
      { name: "symbolName", title: "Symbol Name"}
    ]);
    AppUI.MakeSizeAdjustable(this.treeView.getTreeHeader(), gHistogramContainer.container.parentNode);
    var self = this;
    this.treeView.addEventListener("select", function (frameData) {
      self.highlightFrame(frameData);
      if (window.comparator_setSelection) {
        window.comparator_setSelection(gTreeManager.serializeCurrentSelectionSnapshot(), frameData);
      }
    });
    this.treeView.addEventListener("contextMenuClick", function (e) {
      self._onContextMenuClick(e);
    });
    this.treeView.addEventListener("focusCallstackButtonClicked", function (frameData) {
      var focusedCallstack = self._getCallstackUpTo(frameData);
      /**
       * @todo Decouple AppUI
       */
      AppUI.focusOnCallstack(focusedCallstack, frameData.name);
    });
    this._container = document.createElement("div");
    this._container.className = "tree";
    this._container.appendChild(this.treeView.getContainer());

    // If this is set when the tree changes the snapshot is immediately restored.
    this._savedSnapshot = null;
  }
  ProfileTreeManager.prototype = {
    getContainer: function ProfileTreeManager_getContainer() {
      return this._container;
    },
    highlightFrame: function Treedisplay_highlightFrame(frameData) {
      /**
       * @todo Decouple AppUI
       */
      AppUI.setHighlightedCallstack(this._getCallstackUpTo(frameData), this._getHeaviestCallstack(frameData));
    },
    dataIsOutdated: function ProfileTreeManager_dataIsOutdated() {
      this.treeView.dataIsOutdated();
    },
    saveSelectionSnapshot: function ProfileTreeManager_saveSelectionSnapshot(isJavascriptOnly) {
      this._savedSnapshot = this.treeView.getSelectionSnapshot(isJavascriptOnly);
    },
    saveReverseSelectionSnapshot: function ProfileTreeManager_saveReverseSelectionSnapshot(isJavascriptOnly) {
      this._savedSnapshot = this.treeView.getReverseSelectionSnapshot(isJavascriptOnly);
    },
    hasNonTrivialSelection: function ProfileTreeManager_hasNonTrivialSelection() {
      return this.treeView.getSelectionSnapshot().length > 1;
    },
    serializeCurrentSelectionSnapshot: function ProfileTreeManager_serializeCurrentSelectionSnapshot() {
      var str = JSON.stringify(this.treeView.getSelectionSnapshot());
      console.log(str);
      return str.substring(1, str.length - 1);
    },
    restoreSerializedSelectionSnapshot: function ProfileTreeManager_restoreSerializedSelectionSnapshot(selection) {
      this._savedSnapshot = JSON.parse("[" + selection + "]");
    },
    _restoreSelectionSnapshot: function ProfileTreeManager__restoreSelectionSnapshot(snapshot, allowNonContigous) {
      return this.treeView.restoreSelectionSnapshot(snapshot, allowNonContigous);
    },
    setSelection: function ProfileTreeManager_setSelection(frames, inverted) {
      return this.treeView.setSelection(frames, inverted);
    },
    _getCallstackUpTo: function ProfileTreeManager__getCallstackUpTo(frame) {
      var callstack = [];
      var curr = frame;
      while (curr != null) {
        if (curr.name != null) {
          var subCallstack = curr.fullFrameNamesAsInSample.clone();
          subCallstack.reverse();
          callstack = callstack.concat(subCallstack);
        }
        curr = curr.parent;
      }
      callstack.reverse();
      if (gInvertCallstack)
        callstack.shift(); // remove (total)
      return callstack;
    },
    _getHeaviestCallstack: function ProfileTreeManager__getHeaviestCallstack(frame) {
      // FIXME: This gets the first leaf which is not the heaviest leaf.
      while(frame.children && frame.children.length > 0) {
        var nextFrame = frame.children[0].getData();
        if (!nextFrame)
          break;
        frame = nextFrame;
      }
      return this._getCallstackUpTo(frame);
    },
    _onContextMenuClick: function ProfileTreeManager__onContextMenuClick(e) {
      var node = e.node;
      var menuItem = e.menuItem;

      if (menuItem == "View Source") {
        // Remove anything after ( since MXR doesn't handle search with the arguments.
        var symbol = node.name.split("(")[0];
        window.open("http://mxr.mozilla.org/mozilla-central/search?string=" + symbol, "View Source");
      } else if (menuItem == "View JS Source") {
        this.viewJSSource(node);
      } else if (menuItem == "Plugin View: Pie") {
        focusOnPluginView("protovis", {type:"pie"});
      } else if (menuItem == "Plugin View: Tree") {
        focusOnPluginView("protovis", {type:"tree"});
      } else if (menuItem == "Google Search") {
        var symbol = node.name;
        window.open("https://www.google.ca/search?q=" + symbol, "View Source");
      } else if (menuItem == "Focus Frame") {
        var symbol = node.fullFrameNamesAsInSample[0]; // TODO: we only function one symbol when callpath merging is on, fix that
        /**
         * @todo Decouple AppUI
         */
        AppUI.focusOnSymbol(symbol, node.name);
      } else if (menuItem == "Focus Callstack") {
        var focusedCallstack = this._getCallstackUpTo(node);
        /**
         * @todo Decouple AppUI
         */
        AppUI.focusOnCallstack(focusedCallstack, node.name);
      }
    },
    setAllowNonContigous: function ProfileTreeManager_setAllowNonContigous() {
      this._allowNonContigous = true;
    },
    display: function ProfileTreeManager_display(tree, symbols, functions, resources, useFunctions, filterByName) {
      this.treeView.display(this.convertToJSTreeData(tree, symbols, functions, useFunctions), resources, filterByName);
      if (this._savedSnapshot) {
        var old = this._savedSnapshot.clone();
        this._restoreSelectionSnapshot(this._savedSnapshot, this._allowNonContigous);
        this._savedSnapshot = old;
        this._allowNonContigous = false;
      }
    },
    convertToJSTreeData: function ProfileTreeManager__convertToJSTreeData(rootNode, symbols, functions, useFunctions) {
      var totalSamples = rootNode.counter;
      function createTreeViewNode(node, parent) {
        var curObj = {};
        curObj.parent = parent;
        curObj.counter = node.counter;
        var selfCounter = node.counter;
        for (var i = 0; i < node.children.length; ++i) {
          selfCounter -= node.children[i].counter;
        }
        curObj.selfCounter = selfCounter;
        curObj.ratio = node.counter / totalSamples;
        curObj.fullFrameNamesAsInSample = node.mergedNames ? node.mergedNames : [node.name];
        if (!(node.name in (useFunctions ? functions : symbols))) {
          curObj.name = node.name;
          curObj.library = "";
        } else {
          var functionObj = useFunctions ? functions[node.name] : functions[symbols[node.name].functionIndex];
          var info = {
            functionName: functionObj.functionName,
            libraryName: functionObj.libraryName,
            lineInformation: useFunctions ? "" : symbols[node.name].lineInformation
          };  
          curObj.name = (info.functionName + " " + info.lineInformation).trim();
          curObj.library = info.libraryName;
          curObj.isJSFrame = functionObj.isJSFrame;
          if (functionObj.scriptLocation) {
            curObj.scriptLocation = functionObj.scriptLocation;
          }
        }
        if (node.children.length) {
          curObj.children = getChildrenObjects(node.children, curObj);
        }
        return curObj;
      }
      function getChildrenObjects(children, parent) {
        var sortedChildren = children.slice(0).sort(treeObjSort);
        return sortedChildren.map(function (child) {
          var createdNode = null;
          return {
            getData: function () {
              if (!createdNode) {
                createdNode = createTreeViewNode(child, parent); 
              }
              return createdNode;
            }
          };
        });
      }
      return getChildrenObjects([rootNode], null);
    },
    viewJSSource: function ProfileTreeManager_viewJSSource(sample) {
      var sourceView = new SourceView();
      sourceView.setScriptLocation(sample.scriptLocation);
      sourceView.setSource(gMeta.js.source[sample.scriptLocation.scriptURI]);
      gMainArea.appendChild(sourceView.getContainer());
    },
    focusOnPluginView: function ProfileTreeManager_focusOnPluginView(pluginName, param) {
      var filter = {
        type: "PluginView",
        pluginName: pluginName,
        param: param,
      };
      var newFilterChain = gSampleFilters.concat([filter]);
      gBreadcrumbTrail.addAndEnter({
        title: "Plugin View: " + pluginName,
        enterCallback: function () {
          gSampleFilters = newFilterChain;
          window.dispatchEvent(new CustomEvent('filters-changed'));
        }
      })
    }
  };
  window.ProfileTreeManager = ProfileTreeManager;
}(this));
