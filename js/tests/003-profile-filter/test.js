QUnit.test("Search filter", function(assert) {
  loadCleopatra({
    query: "?report=4c013822c9b91ffdebfbe6b9ef300adec6d5a99f&search=mach_msg_trap",
    assert: assert,
    testFunc: function(cleopatraDocument) {
    },
    profileLoadFunc: function(cleopatraDocument) {
    },
    updatedFiltersFunc: function(cleopatraDocument) {
      var samples = shownSamples(cleopatraDocument);
      
      // Sample count for one of the two threads in the profile
      assert.ok(samples === 339 || samples === 28, "Loaded profile");
    }
  });
});


