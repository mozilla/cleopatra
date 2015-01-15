QUnit.test("Search Filter", function(assert) {
  loadCleopatra({
    query: "?report=4c013822c9b91ffdebfbe6b9ef300adec6d5a99f&search=mach_msg_trap",
    assert: assert,
    testFunc: function(cleopatraObj) {
    },
    profileLoadFunc: function(cleopatraObj) {
    },
    updatedFiltersFunc: function(cleopatraObj) {
      var samples = shownSamples(cleopatraObj);
      
      // Sample count for one of the two threads in the profile
      assert.ok(samples === 339 || samples === 28, "Loaded profile");
    }
  });
});

QUnit.test("Select Filter", function(assert) {
  loadCleopatra({
    query: "?report=4c013822c9b91ffdebfbe6b9ef300adec6d5a99f&select=200,400",
    assert: assert,
    testFunc: function(cleopatraObj) {
    },
    profileLoadFunc: function(cleopatraObj) {
    },
    updatedFiltersFunc: function(cleopatraObj) {
      var samples = shownSamples(cleopatraObj);

      // Sample count for one of the two threads in the profile are both 150
      assert.ok(samples === 150, "Loaded profile");
    }
  });
});

QUnit.test("Restore Selection", function(assert) {
  loadCleopatra({
    query: "?report=1af8b3634507afe71fdd7a4902aca0d50cc20223&selection=0,1,24",
    assert: assert,
    testFunc: function(cleopatraObj) {
    },
    profileLoadFunc: function(cleopatraObj) {
      assert.ok(cleopatraObj.window.gNumSamples === 174, "Loaded profile");

      cleopatraObj.treeDisplayCallback(function(cleopatraObj) {
        assert.equal(cleopatraObj.window.gTreeManager.serializeCurrentSelectionSnapshot(), "0,1,24", "Restored the selection correctly");
      });
    },
  });
});

QUnit.test("Invert & Restore Selection", function(assert) {
  loadCleopatra({
    query: "?report=1af8b3634507afe71fdd7a4902aca0d50cc20223&invertCallback=true&selection=\"(total)\",24,1",
    assert: assert,
    testFunc: function(cleopatraObj) {
    },
    profileLoadFunc: function(cleopatraObj) {
      assert.ok(cleopatraObj.window.gNumSamples === 174, "Loaded profile");

      cleopatraObj.treeDisplayCallback(function(cleopatraObj) {
        assert.equal(cleopatraObj.window.gTreeManager.serializeCurrentSelectionSnapshot(), "\"(total)\",24,1", "Restored the selection correctly");
      });
    },
  });
});

